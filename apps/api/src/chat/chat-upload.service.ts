import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

  getBucketDomain(): string {
    return `${this.bucket}.s3.${this.region}.amazonaws.com`;
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
    const key = `uploads/chat/${folder}/${Date.now()}-${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl, key, maxSizeMB };
  }
}
