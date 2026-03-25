import { Play, Target, Star as StarIcon } from 'lucide-react';

export function HeroCard() {
  return (
    <div className="relative">
      {/* Main card */}
      <div className="brutal-card p-6 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Play className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-bold text-foreground text-sm">IELTS Reading</h4>
            <p className="text-xs text-slate-500">12 lessons &bull; 4h 30m</p>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Progress</span>
            <span className="font-semibold text-primary">65%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className="bg-primary rounded-full h-2.5"
              style={{ width: '65%' }}
            />
          </div>
        </div>
        <button className="w-full brutal-btn bg-primary text-white py-3 text-sm">
          Continue Learning
        </button>
      </div>

      {/* Floating decorations */}
      <div className="absolute -top-4 -right-4 w-14 h-14 bg-rose-200 rounded-2xl flex items-center justify-center border-2 border-border-strong rotate-12">
        <Target className="w-6 h-6 text-rose-600" />
      </div>
      <div className="absolute -bottom-3 -right-6 w-12 h-12 bg-amber-200 rounded-2xl flex items-center justify-center border-2 border-border-strong -rotate-6">
        <StarIcon className="w-5 h-5 text-amber-600 fill-amber-600" />
      </div>
    </div>
  );
}
