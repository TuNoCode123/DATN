'use client';

import { useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

const ALLOWED_TYPES: Record<string, number> = {
  'image/jpeg': 10,
  'image/png': 10,
  'image/webp': 10,
  'image/gif': 10,
  'application/pdf': 10,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 10,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 10,
  'application/zip': 20,
  'application/x-rar-compressed': 20,
  'text/plain': 5,
  'text/csv': 5,
};

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  type: string;
}

export function useChatUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    const maxSizeMB = ALLOWED_TYPES[file.type];
    if (!maxSizeMB) {
      return `File type "${file.type || 'unknown'}" is not allowed.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File too large. Max ${maxSizeMB} MB for this type.`;
    }
    return null;
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      throw new Error(validationError);
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Get presigned URL
      const { data: presign } = await api.post('/chat/upload/presign', {
        fileName: file.name,
        contentType: file.type,
      });

      // Upload to S3 via XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.onabort = () => reject(new Error('Upload cancelled'));

        xhr.open('PUT', presign.uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      xhrRef.current = null;
      setUploading(false);
      setProgress(100);

      return {
        url: presign.fileUrl,
        name: file.name,
        size: file.size,
        type: file.type,
      };
    } catch (err: unknown) {
      xhrRef.current = null;
      setUploading(false);
      setProgress(0);
      const msg = (err as { message?: string }).message || 'Upload failed';
      setError(msg);
      throw err;
    }
  }, [validateFile]);

  const cancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setUploading(false);
    setProgress(0);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setProgress(0);
    setUploading(false);
  }, []);

  return { uploadFile, uploading, progress, error, cancel, reset, validateFile };
}
