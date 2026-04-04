"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import HardBreak from "@tiptap/extension-hard-break";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Palette,
  Highlighter,
} from "lucide-react";

interface TiptapMiniEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function Btn({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded transition-colors ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

const COLORS = [
  "#000000", "#434343", "#666666",
  "#dc2626", "#ea580c", "#d97706",
  "#059669", "#0284c7", "#4f46e5",
  "#7c3aed", "#c026d3",
];

const HIGHLIGHT_COLORS = [
  "#fef08a", "#bbf7d0", "#bfdbfe",
  "#e9d5ff", "#fecdd3", "#fed7aa",
];

function ColorPicker({
  icon,
  title,
  colors,
  columns,
  onSelect,
  onReset,
}: {
  icon: React.ReactNode;
  title: string;
  colors: string[];
  columns: number;
  onSelect: (color: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  return (
    <div className="relative" ref={ref}>
      <Btn onClick={() => setOpen((v) => !v)} active={open} title={title}>
        {icon}
      </Btn>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 p-2 bg-white border rounded-lg shadow-lg z-50 w-max"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: "4px",
          }}
        >
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onSelect(color);
                close();
              }}
              className="w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              onReset();
              close();
            }}
            className="text-xs text-gray-500 hover:text-gray-700 py-0.5"
            style={{ gridColumn: `1 / -1` }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

export default function TiptapMiniEditor({
  content,
  onChange,
  placeholder = "Enter content...",
}: TiptapMiniEditorProps) {
  const isUpdatingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        hardBreak: false,
      }),
      HardBreak.extend({
        addKeyboardShortcuts() {
          return {
            Enter: () => this.editor.commands.setHardBreak(),
            "Shift-Enter": () => {
              this.editor.commands.splitBlock();
              return true;
            },
          };
        },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    immediatelyRender: false,
    content: content || "",
    onUpdate: ({ editor: e }) => {
      isUpdatingRef.current = true;
      onChange(e.getHTML());
      requestAnimationFrame(() => {
        isUpdatingRef.current = false;
      });
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[100px] p-3 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor || isUpdatingRef.current) return;
    const currentHtml = editor.getHTML();
    if (content !== currentHtml) {
      editor.commands.setContent(content || "", { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Compact Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b bg-gray-50">
        <Btn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo size={14} />
        </Btn>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        <Btn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <Strikethrough size={14} />
        </Btn>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        <Btn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <List size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered List"
        >
          <ListOrdered size={14} />
        </Btn>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        <Btn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align Left"
        >
          <AlignLeft size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align Center"
        >
          <AlignCenter size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align Right"
        >
          <AlignRight size={14} />
        </Btn>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Text Color */}
        <ColorPicker
          icon={<Palette size={14} />}
          title="Text Color"
          colors={COLORS}
          columns={4}
          onSelect={(color) => editor.chain().focus().setColor(color).run()}
          onReset={() => editor.chain().focus().unsetColor().run()}
        />

        {/* Highlight */}
        <ColorPicker
          icon={<Highlighter size={14} />}
          title="Highlight"
          colors={HIGHLIGHT_COLORS}
          columns={3}
          onSelect={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
          onReset={() => editor.chain().focus().unsetHighlight().run()}
        />
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
