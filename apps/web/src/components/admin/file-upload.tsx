'use client';

import Image from 'next/image';
import React, { useRef, useState } from 'react';
import { Upload, X, FileAudio, FileImage, File, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUpload } from '@/features/admin/hooks/use-upload';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  accept?: string;
  label?: string;
  maxSizeMB?: number;
}

export function FileUpload({
  value,
  onChange,
  accept,
  label,
  maxSizeMB,
}: FileUploadProps) {
  const { upload, deleteFile, uploading, progress, error } = useFileUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      alert(`File size exceeds ${maxSizeMB}MB limit`);
      return;
    }

    // Create local blob URL for immediate preview
    const blobUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(blobUrl);

    try {
      const { fileUrl, key } = await upload(file);
      setFileKey(key);
      onChange(fileUrl);
    } catch {
      // Upload failed — revoke preview
      URL.revokeObjectURL(blobUrl);
      setLocalPreviewUrl(null);
    }

    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = async () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    if (fileKey) {
      await deleteFile(fileKey);
      setFileKey(null);
    }
    onChange(null);
  };

  const isAudio = accept?.includes('audio') || value?.match(/\.(mp3|wav|ogg|m4a)(\?|$)/i);
  const isImage = accept?.includes('image') || value?.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);

  // Use local blob URL for preview (works even if S3 objects aren't public)
  const previewSrc = localPreviewUrl || value;

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}

      {/* Current file preview */}
      {value && !uploading && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
          {isImage && (
            <Image
              src={previewSrc!}
              alt="Preview"
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 rounded object-cover"
            />
          )}
          {isAudio && (
            <audio controls src={previewSrc!} className="h-8 max-w-[200px]" />
          )}
          {!isImage && !isAudio && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <File className="size-4" />
              <span className="max-w-[200px] truncate">{value.split('/').pop()}</span>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={handleRemove}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Uploading... {progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload button (shown when no file or after removal) */}
      {!value && !uploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed',
            'px-4 py-3 text-sm text-muted-foreground transition-colors',
            'hover:border-primary/50 hover:bg-muted/50',
          )}
        >
          {isAudio ? (
            <FileAudio className="size-4" />
          ) : isImage ? (
            <FileImage className="size-4" />
          ) : (
            <Upload className="size-4" />
          )}
          <span>Click to upload {label?.toLowerCase() || 'file'}</span>
        </button>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
