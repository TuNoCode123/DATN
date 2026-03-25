interface SectionBadgeProps {
  text: string;
}

export function SectionBadge({ text }: SectionBadgeProps) {
  return (
    <span className="inline-block bg-secondary text-secondary-foreground text-xs font-semibold px-4 py-1.5 rounded-full border border-teal-200">
      {text}
    </span>
  );
}
