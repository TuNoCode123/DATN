'use client';

import { useEffect, useCallback } from 'react';
import { Button } from 'antd';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleDownload = () => {
    window.open(src, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <Button
          type="text"
          icon={<DownloadOutlined />}
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          className="!text-white hover:!bg-white/20"
        />
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="!text-white hover:!bg-white/20"
        />
      </div>

      {/* Image */}
      <img
        src={src}
        alt={alt || 'Image'}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
