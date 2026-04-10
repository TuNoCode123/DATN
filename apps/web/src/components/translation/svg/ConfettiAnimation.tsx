'use client';

import { useEffect, useState } from 'react';

interface ConfettiAnimationProps {
  trigger: boolean;
  className?: string;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  delay: number;
  type: 'circle' | 'rect' | 'star';
}

const COLORS = ['#F59E0B', '#EF4444', '#6366F1', '#10B981', '#3B82F6', '#EC4899', '#F97316'];

function createParticles(): Particle[] {
  return Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: 20 + Math.random() * 260,
    y: -10 - Math.random() * 40,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
    delay: Math.random() * 0.5,
    type: (['circle', 'rect', 'star'] as const)[Math.floor(Math.random() * 3)],
  }));
}

export function ConfettiAnimation({ trigger, className = '' }: ConfettiAnimationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger) {
      setParticles(createParticles());
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  if (!visible) return null;

  return (
    <svg
      viewBox="0 0 300 200"
      className={`pointer-events-none ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {particles.map((p) => (
        <g key={p.id}>
          {p.type === 'circle' && (
            <circle cx={p.x} cy={p.y} r={p.size / 2} fill={p.color}>
              <animate
                attributeName="cy"
                from={p.y}
                to={220}
                dur={`${1.5 + p.delay}s`}
                begin={`${p.delay}s`}
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                values="1;1;0"
                dur={`${1.5 + p.delay}s`}
                begin={`${p.delay}s`}
                fill="freeze"
              />
              <animate
                attributeName="cx"
                from={p.x}
                to={p.x + (Math.random() - 0.5) * 60}
                dur={`${1.5 + p.delay}s`}
                begin={`${p.delay}s`}
                fill="freeze"
              />
            </circle>
          )}
          {p.type === 'rect' && (
            <rect
              x={p.x - p.size / 2}
              y={p.y}
              width={p.size}
              height={p.size * 0.6}
              rx="1"
              fill={p.color}
              transform={`rotate(${p.rotation} ${p.x} ${p.y})`}
            >
              <animate
                attributeName="y"
                from={p.y}
                to={220}
                dur={`${1.8 + p.delay}s`}
                begin={`${p.delay}s`}
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                values="1;1;0"
                dur={`${1.8 + p.delay}s`}
                begin={`${p.delay}s`}
                fill="freeze"
              />
            </rect>
          )}
          {p.type === 'star' && (
            <polygon
              points={`${p.x},${p.y - p.size} ${p.x + p.size * 0.3},${p.y - p.size * 0.3} ${p.x + p.size},${p.y - p.size * 0.3} ${p.x + p.size * 0.4},${p.y + p.size * 0.1} ${p.x + p.size * 0.6},${p.y + p.size} ${p.x},${p.y + p.size * 0.4} ${p.x - p.size * 0.6},${p.y + p.size} ${p.x - p.size * 0.4},${p.y + p.size * 0.1} ${p.x - p.size},${p.y - p.size * 0.3} ${p.x - p.size * 0.3},${p.y - p.size * 0.3}`}
              fill={p.color}
            >
              <animate
                attributeName="opacity"
                values="1;1;0"
                dur={`${1.6 + p.delay}s`}
                begin={`${p.delay}s`}
                fill="freeze"
              />
              <animateTransform
                attributeName="transform"
                type="translate"
                from="0 0"
                to={`${(Math.random() - 0.5) * 40} 200`}
                dur={`${1.6 + p.delay}s`}
                begin={`${p.delay}s`}
                fill="freeze"
              />
            </polygon>
          )}
        </g>
      ))}
    </svg>
  );
}
