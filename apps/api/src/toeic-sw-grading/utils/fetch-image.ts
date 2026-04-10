type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const EXTENSION_MAP: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Fetch an image from a URL and return it as base64 with its media type.
 * Supports S3 public URLs and any HTTP(S) image URL.
 */
export async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let mediaType: ImageMediaType;

  if (contentType.startsWith('image/')) {
    mediaType = contentType.split(';')[0].trim() as ImageMediaType;
  } else {
    // Fallback: detect from URL extension
    const ext = url.match(/\.(jpe?g|png|gif|webp)/i)?.[0]?.toLowerCase() || '.jpg';
    mediaType = EXTENSION_MAP[ext] || 'image/jpeg';
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString('base64');

  return { base64, mediaType };
}
