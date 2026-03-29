# AWS S3 Setup Guide

## 1. Create S3 Bucket

- Bucket name: `ielts-ai-platform` (or your preferred name)
- Region: `ap-southeast-2` (or your preferred region)
- Uncheck **"Block all public access"** (needed for public file serving)

## 2. Bucket Policy (Public Read)

Go to Bucket > Permissions > Bucket Policy, paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadUploads",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::ielts-ai-platform/uploads/*"
    }
  ]
}
```

Replace `ielts-ai-platform` with your bucket name.

## 3. CORS Configuration

Go to Bucket > Permissions > CORS, paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your production domain to `AllowedOrigins` when deploying.

## 4. IAM User / Credentials

Create an IAM user with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::ielts-ai-platform/uploads/*"
    }
  ]
}
```

Generate access keys for this user.

## 5. Environment Variables

Add to `apps/api/.env`:

```env
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=ielts-ai-platform
```

## File Organization

Uploaded files are stored as:
```
uploads/
  images/    - JPG, PNG, WebP, GIF (max 10MB)
  audio/     - MP3, WAV, OGG, M4A (max 50MB)
  html/      - HTML files (max 5MB)
  documents/ - PDF files (max 5MB)
  files/     - Other allowed types
```
