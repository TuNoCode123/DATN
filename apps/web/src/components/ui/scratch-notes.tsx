'use client';

import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface ScratchNotesProps {
  label?: string;
}

export function ScratchNotes({
  label = 'Viết ghi chú / dàn ý',
}: ScratchNotesProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(!open)}
        className="border border-slate-300 bg-white text-slate-700 px-3 py-1.5 text-xs rounded flex items-center gap-1.5 w-full justify-between cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          {label}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
      {open && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Your notes here... (not saved to server)"
          className="w-full mt-2 p-3 border border-slate-300 rounded bg-white text-sm resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      )}
    </div>
  );
}
