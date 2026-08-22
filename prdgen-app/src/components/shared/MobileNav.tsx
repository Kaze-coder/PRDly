'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FilePlus, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Logo } from '@/components/shared/Logo';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/new', label: 'Perencanaan Baru', icon: FilePlus },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="lg:hidden">
            <Menu className="size-5" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center">
            <Logo size={32} />
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-dim hover:bg-accent-soft/50 hover:text-ink'
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-border p-3">
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
