import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage, Bucket } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { extname } from 'path';

const CHAT_ALLOWED_TYPES: Record<string, number> = {
  // Images (10MB)
  'image/jpeg': 10,
  'image/png': 10,
  'image/webp': 10,
  'image/gif': 10,
  // Documents (10MB)
  'application/pdf': 10,
  // Office (10MB)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 10,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 10,
  // Archives (20MB)
  'application/zip': 20,
  'application/x-rar-compressed': 20,
  // Text (5MB)
  'text/plain': 5,
  'text/csv': 5,
};

const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

@Injectable()
export class ChatUploadService {
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;

  constructor(private config: ConfigService) {
    this.bucketName = this.config.getOrThrow<string>('GCS_UPLOADS_BUCKET_NAME');

    this.storage = new Storage();
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async generatePresignedUrl(fileName: string, contentType: string) {
    const maxSizeMB = CHAT_ALLOWED_TYPES[contentType];
    if (!maxSizeMB) {
      throw new BadRequestException(
        `File type "${contentType}" is not allowed. Allowed: ${Object.keys(CHAT_ALLOWED_TYPES).join(', ')}`,
      );
    }

    const folder = contentType.startsWith('image/') ? 'images' : 'files';
    const ext = extname(fileName) || EXT_MAP[contentType] || '';
    const key = `chat/${folder}/${Date.now()}-${randomUUID()}${ext}`;

    const [uploadUrl] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 300 * 1000,
      contentType,
    });

    const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${key}`;

    return { uploadUrl, fileUrl, key, maxSizeMB };
  }

  /**
   * Historically converted a raw S3 URL into a presigned GET URL. The GCS
   * uploads bucket is public-read (infra-gcp/modules/storage — same as the
   * AWS bucket's public policy actually already covered "uploads/chat/*"
   * too), so stored URLs are already directly fetchable; this is now a
   * passthrough kept for interface stability (chat.service.ts calls it on
   * every message read).
   */
  async signUrl(rawUrl: string): Promise<string> {
    return rawUrl;
  }
}
