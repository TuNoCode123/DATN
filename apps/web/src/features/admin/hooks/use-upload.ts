'use client';

import { useState, useCallback } from 'react';
import { adminUploadApi } from '@/lib/admin-api';

interface UploadResult {
  fileUrl: string;
  key: string;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File): Promise<UploadResult> => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // 1. Get presigned URL from backend
      const { uploadUrl, fileUrl, key, maxSizeMB } =
        await adminUploadApi.presign(file.name, file.type);

      // Client-side size check
      if (file.size > maxSizeMB * 1024 * 1024) {
        throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
      }

      // 2. Upload directly to S3 via XHR (for progress tracking)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      setProgress(100);
      return { fileUrl, key };
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (err as { message?: string })?.message || 'Upload failed';
      setError(msg);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const deleteFile = useCallback(async (key: string) => {
    try {
      await adminUploadApi.delete(key);
    } catch {
      // Ignore delete errors — file may already be gone
    }
  }, []);

  return { upload, deleteFile, uploading, progress, error };
}
