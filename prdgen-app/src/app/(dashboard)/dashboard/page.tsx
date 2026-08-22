'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import type { PRD, PRDStatus } from '@/types';
import { getModelById } from '@/lib/ai/models';

const STATUS_STAMP: Record<PRDStatus, string> = {
  draft: 'border-ink-faint text-ink-faint',
  generating: 'border-primary text-primary',
  completed: 'border-primary text-primary',
  failed: 'border-stamp text-stamp',
};

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [prds, setPrds] = useState<PRD[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/prd')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        if (!cancelled) setPrds(Array.isArray(json?.data) ? json.data : []);
      })
      .catch(() => {
        if (!cancelled) setPrds([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPRDs = useMemo(
    () => prds.filter((prd) => prd.title.toLowerCase().includes(search.toLowerCase())),
    [prds, search]
  );

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    return prds.filter((p) => {
      const d = new Date(p.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [prds]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="stagger-reveal stagger-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint">Ruang Dokumen</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Arsip PRD Kamu</h1>
        <p className="mt-2 text-sm text-ink-dim">Semua spesifikasi produk yang sudah digenerate tersimpan di sini.</p>
      </div>

      {/* Stats */}
      <div className="stagger-reveal stagger-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="perf-ticket rounded-md p-4 pl-6">
          <p className="font-mono text-xs text-ink-faint">TOTAL PRD</p>
          <p className="mt-1 text-3xl font-bold text-ink">{loading ? '...' : prds.length}</p>
        </div>
        <div className="perf-ticket rounded-md p-4 pl-6">
          <p className="font-mono text-xs text-ink-faint">PRD BULAN INI</p>
          <p className="mt-1 text-3xl font-bold text-ink">{loading ? '...' : thisMonthCount}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="stagger-reveal stagger-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button render={<Link href="/new" />} size="lg" className="btn-goo gap-2">
          <Plus className="size-4" />
          Buat PRD Baru
          <Sparkles className="size-3.5" />
        </Button>

        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Cari PRD..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 border-border-paper bg-paper-raised pl-8 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* PRD list — grid of tickets */}
      {!loading && filteredPRDs.length === 0 ? (
        <div className="perf-ticket stagger-reveal stagger-4 rounded-md p-12 pl-10 text-center" style={{ animationDelay: '240ms' }}>
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Arsip Kosong</p>
          <h3 className="mt-2 text-xl font-bold text-ink">Belum ada PRD</h3>
          <p className="mb-4 mt-2 text-sm text-ink-dim">Mulai buat Product Requirements Document pertama kamu.</p>
          <Button render={<Link href="/new" />} className="gap-2">
            <Plus className="size-4" />
            Buat PRD Baru
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPRDs.map((prd) => {
            const stamp = STATUS_STAMP[prd.status];
            const model = prd.model_used ? getModelById(prd.model_used) : null;
            const date = new Date(prd.created_at);

            return (
              <Link key={prd.id} href={`/workspace/${prd.id}`}>
                <SpotlightCard className="perf-ticket group cursor-pointer rounded-md p-4 pl-6">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-2 text-sm font-semibold text-ink">{prd.title}</CardTitle>
                    <span className={cn('stamp text-[9px] shrink-0', stamp)}>{prd.status.toUpperCase()}</span>
                  </div>
                  {prd.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-ink-dim">{prd.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-faint">
                    {model && (
                      <span className="flex items-center gap-1">
                        <Sparkles className="size-3" />
                        {model.name}
                      </span>
                    )}
                    <span className="font-mono">
                      {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </SpotlightCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
