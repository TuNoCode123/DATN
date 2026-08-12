import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Storage, Bucket, File } from '@google-cloud/storage';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private storage: Storage;
  private bucket: Bucket;
  private tts: TextToSpeechClient;

  constructor(private config: ConfigService) {
    const bucketName = this.config.getOrThrow<string>('GCS_ASSETS_BUCKET_NAME');

    // Auth via Application Default Credentials — the Cloud Run service
    // account in production, `gcloud auth application-default login`
    // locally. No key file involved.
    this.storage = new Storage();
    this.bucket = this.storage.bucket(bucketName);
    this.tts = new TextToSpeechClient();
  }

  async getAudioUrl(sentence: string): Promise<{ url: string; cached: boolean }> {
    const hash = createHash('sha256')
      .update(sentence.toLowerCase().trim())
      .digest('hex');
    const key = `tts/${hash}.mp3`;
    const file = this.bucket.file(key);

    // Check GCS cache
    const [exists] = await file.exists();
    if (exists) {
      const url = await this.getSignedReadUrl(file);
      return { url, cached: true };
    }

    // Cache miss: synthesize with Text-to-Speech
    const audioBuffer = await this.synthesize(sentence);
    await file.save(audioBuffer, { contentType: 'audio/mpeg' });
    const url = await this.getSignedReadUrl(file);

    this.logger.log(`TTS cached: "${sentence.substring(0, 50)}..." -> ${key}`);
    return { url, cached: false };
  }

  private async synthesize(sentence: string): Promise<Buffer> {
    const [response] = await this.tts.synthesizeSpeech({
      input: { text: sentence },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Neural2-F', // comparable neural female US voice to Polly's "Joanna"
      },
      audioConfig: {
        audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      },
    });

    return Buffer.from(response.audioContent as Uint8Array);
  }

  private async getSignedReadUrl(file: File): Promise<string> {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 3600 * 1000,
    });
    return url;
  }
}
