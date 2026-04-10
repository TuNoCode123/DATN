'use client';

export function TranslateIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="tl-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#EF4444" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="tl-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Vietnamese speech bubble (left) */}
      <g>
        <rect x="20" y="30" width="120" height="70" rx="16" fill="url(#tl-grad-1)" stroke="#F59E0B" strokeWidth="2" />
        <polygon points="80,100 90,120 100,100" fill="url(#tl-grad-1)" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round" />
        <line x1="80" y1="100" x2="100" y2="100" stroke="url(#tl-grad-1)" strokeWidth="3" />
        {/* Vietnamese flag accent */}
        <circle cx="45" cy="50" r="8" fill="#EF4444" opacity="0.8" />
        <polygon
          points="45,43 46.5,47.5 51,47.5 47.5,50.5 49,55 45,52 41,55 42.5,50.5 39,47.5 43.5,47.5"
          fill="#F59E0B"
        />
        <text x="60" y="56" fontSize="11" fontWeight="bold" fill="#92400E">Tiếng Việt</text>
        <rect x="40" y="68" width="80" height="4" rx="2" fill="#F59E0B" opacity="0.4" />
        <rect x="40" y="78" width="55" height="4" rx="2" fill="#F59E0B" opacity="0.3" />
      </g>

      {/* Arrow */}
      <g>
        <path
          d="M155 80 L175 80"
          stroke="#94A3B8"
          strokeWidth="2"
          strokeDasharray="4 3"
        >
          <animate attributeName="stroke-dashoffset" from="14" to="0" dur="2s" repeatCount="indefinite" />
        </path>
        <polygon points="175,75 185,80 175,85" fill="#6366F1" opacity="0.7">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
        </polygon>
      </g>

      {/* English speech bubble (right) */}
      <g>
        <rect x="190" y="30" width="120" height="70" rx="16" fill="url(#tl-grad-2)" stroke="#6366F1" strokeWidth="2" />
        <polygon points="230,100 240,120 250,100" fill="url(#tl-grad-2)" stroke="#6366F1" strokeWidth="2" strokeLinejoin="round" />
        <line x1="230" y1="100" x2="250" y2="100" stroke="url(#tl-grad-2)" strokeWidth="3" />
        {/* English flag accent */}
        <rect x="205" y="44" width="16" height="12" rx="2" fill="#3B82F6" opacity="0.8" />
        <line x1="205" y1="50" x2="221" y2="50" stroke="white" strokeWidth="1.5" />
        <line x1="213" y1="44" x2="213" y2="56" stroke="white" strokeWidth="1.5" />
        <text x="226" y="56" fontSize="11" fontWeight="bold" fill="#312E81">English</text>
        <rect x="210" y="68" width="80" height="4" rx="2" fill="#6366F1" opacity="0.4" />
        <rect x="210" y="78" width="55" height="4" rx="2" fill="#6366F1" opacity="0.3" />
      </g>

      {/* Decorative dots */}
      <circle cx="30" cy="160" r="3" fill="#F59E0B" opacity="0.3" />
      <circle cx="50" cy="170" r="2" fill="#EF4444" opacity="0.2" />
      <circle cx="280" cy="155" r="3" fill="#6366F1" opacity="0.3" />
      <circle cx="300" cy="168" r="2" fill="#3B82F6" opacity="0.2" />

      {/* Bottom text */}
      <text x="160" y="155" textAnchor="middle" fontSize="10" fill="#94A3B8" fontWeight="600">
        Translate & Learn
      </text>
    </svg>
  );
}
