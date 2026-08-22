'use client';

import { useState } from 'react';
import { History, Clock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

interface Version {
  id: string;
  version_number: number;
  created_at: string;
  label: string;
}

// Mock version history — up to 10 versions per PRD
const MOCK_VERSIONS: Version[] = [
  { id: 'v10', version_number: 10, created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), label: 'Versi saat ini' },
  { id: 'v9', version_number: 9, created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), label: 'Refine bagian API' },
  { id: 'v8', version_number: 8, created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), label: 'Regenerate User Personas' },
  { id: 'v7', version_number: 7, created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), label: 'Edit manual Executive Summary' },
  { id: 'v6', version_number: 6, created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), label: 'Generate awal' },
];

export function VersionHistory() {
  const [open, setOpen] = useState(false);

  function restore(v: Version) {
    toast.add({
      title: `Versi ${v.version_number} dipulihkan`,
      description: v.label,
      type: 'success',
    });
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <History className="size-3.5" />
            <span className="hidden sm:inline">Riwayat</span>
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            Riwayat Versi
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-1 px-4">
          <p className="mb-4 text-xs text-ink-dim">
            Menyimpan hingga 10 versi terakhir.
          </p>
          {MOCK_VERSIONS.map((v, i) => (
            <div
              key={v.id}
              className="group flex items-start gap-3 rounded-lg border border-border-paper p-3 hover:border-ink-faint hover:bg-muted"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                v{v.version_number}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{v.label}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-dim">
                  <Clock className="size-3" />
                  {new Date(v.created_at).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {i !== 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => restore(v)}
                >
                  <RotateCcw className="size-3" />
                  Pulihkan
                </Button>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
