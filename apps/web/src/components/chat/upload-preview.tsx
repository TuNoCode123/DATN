'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button, Progress } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { FileIcon } from './file-icon';
import { formatBytes } from '@/lib/format-bytes';

interface Props {
  file: File;
  progress: number;
  uploading: boolean;
  error: string | null;
  onCancel: () => void;
  onRemove: () => void;
}

export function UploadPreview({ file, progress, uploading, error, onCancel, onRemove }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    if (isImage) {
      const url = URL.createObjectURL(file);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, isImage]);

  return (
    <div className="mx-3 mb-2 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
      {/* Preview / Icon */}
      {isImage && preview ? (
        <Image
          src={preview}
          alt={file.name}
          width={56}
          height={56}
          unoptimized
          className="w-14 h-14 object-cover rounded-md flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 flex items-center justify-center bg-white rounded-md border flex-shrink-0">
          <FileIcon mimeType={file.type} size={28} />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
        {uploading && (
          <Progress percent={progress} size="small" showInfo={false} className="mt-1" />
        )}
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
      </div>

      {/* Cancel / Remove */}
      <Button
        type="text"
        size="small"
        icon={<CloseOutlined />}
        onClick={uploading ? onCancel : onRemove}
        className="flex-shrink-0"
      />
    </div>
  );
}
