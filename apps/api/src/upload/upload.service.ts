import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage, Bucket } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { extname } from 'path';

const ALLOWED_TYPES: Record<string, number> = {
  // Images (10MB)
  'image/jpeg': 10,
  'image/png': 10,
  'image/webp': 10,
  'image/gif': 10,
  // Audio (50MB)
  'audio/mpeg': 50,
  'audio/wav': 50,
  'audio/ogg': 50,
  'audio/mp4': 50,
  'audio/webm': 50,
  // Documents (5MB)
  'text/html': 5,
  'application/pdf': 5,
};

@Injectable()
export class UploadService {
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;

  constructor(private config: ConfigService) {
    this.bucketName = this.config.getOrThrow<string>('GCS_UPLOADS_BUCKET_NAME');

    // Auth via Application Default Credentials — the Cloud Run service
    // account in production, `gcloud auth application-default login`
    // locally. No key file involved.
    this.storage = new Storage();
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async generatePresignedUrl(fileName: string, contentType: string) {
    const maxSizeMB = ALLOWED_TYPES[contentType];
    if (!maxSizeMB) {
      throw new BadRequestException(
        `File type "${contentType}" is not allowed. Allowed types: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
      );
    }

    const folder = this.getFolderForType(contentType);
    const ext = extname(fileName) || this.getExtForType(contentType);
    // No "uploads/" prefix — this bucket is dedicated solely to uploads
    // (unlike the AWS side's shared bucket, which needed the prefix to scope
    // its public-read policy — see infra-gcp/modules/storage's note).
    const key = `${folder}/${Date.now()}-${randomUUID()}${ext}`;

    return this.buildPresignedResponse(key, contentType, maxSizeMB);
  }

  async generatePresignedUrlForKey(key: string, contentType: string) {
    return this.buildPresignedResponse(key, contentType);
  }

  private async buildPresignedResponse(
    key: string,
    contentType: string,
    maxSizeMB?: number,
  ) {
    const [uploadUrl] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 300 * 1000,
      contentType,
    });

    // Bucket is public-read (infra-gcp/modules/storage) — the object is
    // reachable at this fixed URL as soon as the upload completes, no
    // signing needed for reads.
    const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${key}`;

    return maxSizeMB
      ? { uploadUrl, fileUrl, key, maxSizeMB }
      : { uploadUrl, fileUrl, key };
  }

  async deleteFile(key: string) {
    if (key.includes('..') || key.startsWith('/')) {
      throw new BadRequestException('Invalid file key');
    }

    await this.bucket.file(key).delete();

    return { success: true };
  }

  private getFolderForType(contentType: string): string {
    if (contentType.startsWith('image/')) return 'images';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType === 'text/html') return 'html';
    if (contentType === 'application/pdf') return 'documents';
    return 'files';
  }

  private getExtForType(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/mp4': '.m4a',
      'text/html': '.html',
      'application/pdf': '.pdf',
    };
    return map[contentType] || '';
  }
}
