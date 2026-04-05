"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { RichContent } from "@/components/rich-content";

interface TranscriptSectionProps {
  html: string;
  className?: string;
}

export function TranscriptSection({ html, className = "" }: TranscriptSectionProps) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors cursor-pointer font-medium"
      >
        {open ? "Ẩn" : "Hiện"} Transcript
        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="mt-2 text-sm text-slate-700 leading-[1.75] border-l-2 border-blue-200 pl-4">
            <RichContent html={html} />
          </div>
        </div>
      </div>
    </div>
  );
}
