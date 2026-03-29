'use client';

import {
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FileTextOutlined,
  FileOutlined,
  FilePptOutlined,
} from '@ant-design/icons';

const ICON_MAP: Record<string, { icon: React.ComponentType<{ style?: React.CSSProperties }>; color: string }> = {
  'application/pdf': { icon: FilePdfOutlined, color: '#e53e3e' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: FileExcelOutlined, color: '#38a169' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: FileWordOutlined, color: '#3182ce' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { icon: FilePptOutlined, color: '#d69e2e' },
  'application/zip': { icon: FileZipOutlined, color: '#805ad5' },
  'application/x-rar-compressed': { icon: FileZipOutlined, color: '#805ad5' },
  'text/plain': { icon: FileTextOutlined, color: '#718096' },
  'text/csv': { icon: FileTextOutlined, color: '#718096' },
};

interface Props {
  mimeType: string;
  size?: number;
}

export function FileIcon({ mimeType, size = 24 }: Props) {
  const entry = ICON_MAP[mimeType] || { icon: FileOutlined, color: '#718096' };
  const Icon = entry.icon;
  return <Icon style={{ fontSize: size, color: entry.color }} />;
}
