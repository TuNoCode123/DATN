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
    <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 hover:border-slate-200 transition-colors group">
      <div
        className={`w-14 h-14 ${iconBg} rounded-xl flex items-center justify-center mx-auto mb-5`}
      >
        <Icon className={`w-7 h-7 ${iconColor}`} />
      </div>
      <h3 className="font-bold text-foreground text-lg mb-2">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
