import type { LucideIcon } from 'lucide-react';
import { BookOpen, Clock, Users, Star } from 'lucide-react';

interface TestCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  author: string;
  lessons: number;
  hours: number;
  students: string;
  rating: number;
}

export function TestCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  author,
  lessons,
  hours,
  students,
  rating,
}: TestCardProps) {
  return (
    <div className="brutal-card p-5 cursor-pointer group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}
          >
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-base">{title}</h3>
            <p className="text-slate-500 text-sm">by {author}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
          <Star className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
          <span className="text-xs font-semibold text-emerald-700">{rating}</span>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          {lessons} lessons
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {hours}h
        </span>
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {students}
        </span>
      </div>
    </div>
  );
}
