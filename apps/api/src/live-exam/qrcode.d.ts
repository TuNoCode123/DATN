declare module 'qrcode' {
  export function toBuffer(
    text: string,
    opts?: { width?: number; margin?: number; errorCorrectionLevel?: string },
  ): Promise<Buffer>;
  export function toDataURL(text: string, opts?: unknown): Promise<string>;
}
