/** Maps imageSize values to Tailwind responsive classes for <img>.
 *  Every size includes `max-w-full` so the image never overflows its parent
 *  container and scales down proportionally on narrow viewports. */
export function getImageSizeClasses(imageSize?: string | null): string {
  const base = 'max-w-full';
  switch (imageSize) {
    case 'small':
      return `${base} md:max-w-[150px] max-h-[150px]`;
    case 'large':
      return `${base} md:max-w-[400px] max-h-[400px]`;
    case 'extra-large':
      return `${base} md:max-w-[600px] max-h-[600px]`;
    case 'medium':
    default:
      return `${base} md:max-w-[250px] max-h-[250px]`;
  }
}

/** Maps imageSize to a container max-width class that fits the image.
 *  Uses responsive breakpoints so containers shrink on mobile. */
export function getImageContainerClass(imageSize?: string | null): string {
  switch (imageSize) {
    case 'small':
      return 'md:max-w-[150px]';
    case 'large':
      return 'md:max-w-[400px]';
    case 'extra-large':
      return 'md:max-w-[600px]';
    case 'medium':
    default:
      return 'md:max-w-sm';
  }
}

/** Maps imageSize to max-height class only (for picture composition) */
export function getImageMaxHeight(imageSize?: string | null): string {
  switch (imageSize) {
    case 'small':
      return 'max-h-40';
    case 'large':
      return 'max-h-80';
    case 'extra-large':
      return 'max-h-[500px]';
    case 'medium':
    default:
      return 'max-h-60';
  }
}
