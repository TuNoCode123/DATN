import type { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  iconBg,
  iconColor,
}: FeatureCardProps) {
  return (
    <div className={`brutal-card ${iconBg} p-8 text-left group h-full`}>
      <div className="w-16 h-16 bg-white border-[2.5px] border-foreground rounded-2xl flex items-center justify-center mb-6 shadow-[4px_4px_0px_rgba(15,23,42,1)] transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-[6px_6px_0px_rgba(15,23,42,1)]">
        <Icon className={`w-8 h-8 ${iconColor}`} strokeWidth={2.5} />
      </div>
      <h3 className="font-extrabold text-foreground text-xl mb-3 tracking-tight">
        {title}
      </h3>
      <p className="text-slate-700 text-sm leading-relaxed font-medium">
        {description}
      </p>
    </div>
  );
}
