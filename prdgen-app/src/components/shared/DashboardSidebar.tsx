'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, FilePlus, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/shared/Logo';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/new', label: 'Perencanaan Baru', icon: FilePlus },
] as const;

const STORAGE_KEY = 'prdgen.sidebarPinned';

/**
 * Collapsible sidebar with the 21st.dev / Aceternity animation:
 * width 68px ↔ 240px, collapsed by default, expands on hover; labels fade in
 * and nudge (translate-x) while icons stay put. A pin toggle keeps it open.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Restore persisted pin state (client-only to avoid hydration mismatch).
  useEffect(() => {
    try {
      setPinned(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // localStorage unavailable
    }
  }, []);

  function togglePin() {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  const open = pinned || hovered;

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative hidden shrink-0 flex-col overflow-hidden border-r border-border-paper bg-paper lg:flex',
        'transition-[width] duration-300 ease-in-out',
        open ? 'w-60' : 'w-[68px]'
      )}
    >
      {/* Logo row */}
      <div className="flex h-14 items-center gap-2 border-b border-border-paper px-[19px]">
        <Logo size={30} showWordmark={false} />
        <span
          className={cn(
            'font-heading text-base font-bold tracking-tight text-ink whitespace-nowrap',
            'transition-opacity duration-200 ease-in-out',
            open ? 'opacity-100' : 'opacity-0'
          )}
        >
          PRDly
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={!open ? label : undefined}
              className={cn(
                'group/link flex items-center gap-2.5 rounded-lg px-[11px] py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-dim hover:bg-accent-soft/50 hover:text-ink'
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span
                className={cn(
                  'whitespace-nowrap transition-all duration-200 ease-in-out group-hover/link:translate-x-0.5',
                  open ? 'opacity-100' : 'opacity-0'
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Pin / collapse toggle */}
      <div className="border-t border-border-paper p-3">
        <button
          type="button"
          onClick={togglePin}
          aria-label={pinned ? 'Lepas sematan sidebar' : 'Sematkan sidebar terbuka'}
          aria-pressed={pinned}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-[11px] py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-accent-soft/50 hover:text-ink'
          )}
        >
          {pinned ? (
            <PanelLeftClose className="size-4 shrink-0" />
          ) : (
            <PanelLeft className="size-4 shrink-0" />
          )}
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-200 ease-in-out',
              open ? 'opacity-100' : 'opacity-0'
            )}
          >
            {pinned ? 'Tutup' : 'Sematkan'}
          </span>
        </button>
      </div>
    </aside>
  );
}
