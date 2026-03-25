import { Star } from 'lucide-react';

interface TestimonialCardProps {
  quote: string;
  name: string;
  role: string;
  initial: string;
  initialBg: string;
  stars?: number;
}

export function TestimonialCard({
  quote,
  name,
  role,
  initial,
  initialBg,
  stars = 5,
}: TestimonialCardProps) {
  return (
    <div className="brutal-card p-6 flex flex-col justify-between">
      {/* Stars */}
      <div>
        <div className="flex gap-0.5 mb-4">
          {Array.from({ length: stars }).map((_, i) => (
            <Star
              key={i}
              className="w-4 h-4 text-amber-400 fill-amber-400"
            />
          ))}
        </div>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          &quot;{quote}&quot;
        </p>
      </div>
      {/* Author */}
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 ${initialBg} rounded-full flex items-center justify-center text-sm font-bold text-white`}
        >
          {initial}
        </div>
        <div>
          <p className="font-bold text-foreground text-sm">{name}</p>
          <p className="text-slate-500 text-xs">{role}</p>
        </div>
      </div>
    </div>
  );
}
