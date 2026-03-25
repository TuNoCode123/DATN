"use client";

import { useRef, useEffect } from "react";
import katex from "katex";

interface RichContentProps {
  html: string;
  className?: string;
}

/**
 * Renders HTML strings that may contain KaTeX math delimiters and images.
 * - Inline math: \(...\)
 * - Display math: \[...\]
 * - Images, bold, italic, etc. pass through as HTML
 */
export function RichContent({ html, className }: RichContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // First set raw HTML
    containerRef.current.innerHTML = renderMath(html);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`rich-content ${className ?? ""}`}
    />
  );
}

/** Replace \(...\) and \[...\] with rendered KaTeX HTML */
function renderMath(input: string): string {
  // Display math: \[...\]
  let result = input.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_, tex: string) => {
      try {
        return katex.renderToString(tex.trim(), {
          displayMode: true,
          throwOnError: false,
        });
      } catch {
        return `<span class="text-red-500">[Math Error]</span>`;
      }
    }
  );

  // Inline math: \(...\)
  result = result.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_, tex: string) => {
      try {
        return katex.renderToString(tex.trim(), {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        return `<span class="text-red-500">[Math Error]</span>`;
      }
    }
  );

  return result;
}
