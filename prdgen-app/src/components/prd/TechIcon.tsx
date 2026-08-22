"use client";

import { useState } from 'react';

interface TechIconProps {
  name: string;
  className?: string;
}

/** Brand color map untuk tiap tech (dipakai sebagai warna tile + fallback text). */
const BRAND: Record<string, { color: string; slug: string }> = {
  React: { color: '#61DAFB', slug: 'react' },
  'Next.js': { color: '#1A1A16', slug: 'nextdotjs' },
  Vue: { color: '#4FC08D', slug: 'vuedotjs' },
  Angular: { color: '#DD0031', slug: 'angular' },
  Svelte: { color: '#FF3E00', slug: 'svelte' },
  'Node.js': { color: '#339933', slug: 'nodedotjs' },
  Python: { color: '#3776AB', slug: 'python' },
  Go: { color: '#00ADD8', slug: 'go' },
  Java: { color: '#ED8B00', slug: 'openjdk' },
  PostgreSQL: { color: '#4169E1', slug: 'postgresql' },
  MongoDB: { color: '#47A248', slug: 'mongodb' },
  MySQL: { color: '#4479A1', slug: 'mysql' },
  Redis: { color: '#DC382D', slug: 'redis' },
  Firebase: { color: '#FFCA28', slug: 'firebase' },
  Supabase: { color: '#3ECF8E', slug: 'supabase' },
  AWS: { color: '#FF9900', slug: 'amazonwebservices' },
  Vercel: { color: '#1A1A16', slug: 'vercel' },
  Docker: { color: '#2496ED', slug: 'docker' },
  GraphQL: { color: '#E10098', slug: 'graphql' },
  'Tailwind CSS': { color: '#06B6D4', slug: 'tailwindcss' },
};

export function TechIcon({ name, className = '' }: TechIconProps) {
  const [error, setError] = useState(false);
  const brand = BRAND[name];
  const color = brand?.color ?? '#5A574C';

  if (!brand || error) {
    return (
      <span
        className={`inline-flex size-3.5 items-center justify-center font-mono text-[8px] font-bold leading-none ${className}`}
        style={{ color }}
        aria-hidden="true"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${brand.slug}/${color.replace('#', '')}`}
      alt={name}
      className={`size-3.5 ${className}`}
      loading="lazy"
      aria-hidden="true"
      onError={() => setError(true)}
    />
  );
}
