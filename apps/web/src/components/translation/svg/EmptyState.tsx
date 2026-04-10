'use client';

export function EmptyState({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="empty-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Background circle */}
      <circle cx="100" cy="70" r="55" fill="url(#empty-grad)" />

      {/* Document icon */}
      <rect x="72" y="38" width="56" height="68" rx="6" fill="white" stroke="#CBD5E1" strokeWidth="2" />
      <rect x="82" y="52" width="36" height="4" rx="2" fill="#E2E8F0" />
      <rect x="82" y="62" width="28" height="4" rx="2" fill="#E2E8F0" />
      <rect x="82" y="72" width="32" height="4" rx="2" fill="#E2E8F0" />
      <rect x="82" y="82" width="20" height="4" rx="2" fill="#E2E8F0" />

      {/* Question mark */}
      <circle cx="130" cy="45" r="14" fill="#F59E0B" opacity="0.9">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="3s" repeatCount="indefinite" />
      </circle>
      <text x="130" y="51" textAnchor="middle" fontSize="16" fontWeight="bold" fill="white">?</text>

      {/* Bottom text area */}
      <text x="100" y="130" textAnchor="middle" fontSize="11" fill="#94A3B8" fontWeight="600">
        No content yet
      </text>
      <text x="100" y="146" textAnchor="middle" fontSize="9" fill="#CBD5E1">
        Start practicing to see results
      </text>
    </svg>
  );
}
