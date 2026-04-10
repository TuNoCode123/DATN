import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
  private s3: S3Client;
  private bucket: string;
  private region: string;

  constructor(private config: ConfigService) {
    this.region = this.config.get<string>('AWS_REGION', 'ap-southeast-2');
    this.bucket = this.config.get<string>('S3_BUCKET_NAME', '');

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');

    this.s3 = new S3Client({
      region: this.region,
      // Only set explicit credentials if provided (local dev).
      // In ECS, omit so the SDK uses the IAM task role automatically.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
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
    const key = `uploads/${folder}/${Date.now()}-${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl, key, maxSizeMB };
  }

  async generatePresignedUrlForKey(key: string, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl, key };
  }

  async deleteFile(key: string) {
    if (!key.startsWith('uploads/')) {
      throw new BadRequestException('Invalid file key');
    }

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

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
