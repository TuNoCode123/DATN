import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PollyClient,
  SynthesizeSpeechCommand,
} from '@aws-sdk/client-polly';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private s3: S3Client;
  private polly: PollyClient;
  private bucket: string;
  private region: string;

  constructor(private config: ConfigService) {
    this.region = this.config.get<string>('AWS_REGION', 'ap-southeast-2');
    this.bucket = this.config.get<string>('S3_BUCKET_NAME', '');

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');
    const creds =
      accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {};

    this.s3 = new S3Client({
      region: this.region,
      ...creds,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    this.polly = new PollyClient({
      region: this.config.get<string>('AWS_POLLY_REGION', this.region),
      ...creds,
    });
  }

  async getAudioUrl(sentence: string): Promise<{ url: string; cached: boolean }> {
    const hash = createHash('sha256')
      .update(sentence.toLowerCase().trim())
      .digest('hex');
    const key = `tts/${hash}.mp3`;

    // Check S3 cache
    const exists = await this.objectExists(key);
    if (exists) {
      const url = await this.getPresignedUrl(key);
      return { url, cached: true };
    }

    // Cache miss: synthesize with Polly
    const audioBuffer = await this.synthesize(sentence);
    await this.upload(key, audioBuffer);
    const url = await this.getPresignedUrl(key);

    this.logger.log(`TTS cached: "${sentence.substring(0, 50)}..." -> ${key}`);
    return { url, cached: false };
  }

  private async synthesize(sentence: string): Promise<Buffer> {
    const result = await this.polly.send(
      new SynthesizeSpeechCommand({
        Text: sentence,
        OutputFormat: 'mp3',
        VoiceId: 'Joanna',
        Engine: 'neural',
        LanguageCode: 'en-US',
      }),
    );

    const chunks: Uint8Array[] = [];
    for await (const chunk of result.AudioStream as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  private async objectExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private async upload(key: string, body: Buffer): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'audio/mpeg',
      }),
    );
  }

  private async getPresignedUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }
}
