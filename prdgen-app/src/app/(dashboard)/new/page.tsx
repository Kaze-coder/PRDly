'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Zap } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePRDStore } from '@/stores/prd-store';
import { cn } from '@/lib/utils';

interface CustomEngine {
  id: string;
  name: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  compat: 'openai' | 'anthropic';
}

const ENGINES_LS_KEY = 'prdgen.customEngines';

export default function NewPlanPage() {
  const router = useRouter();
  const setPendingIdea = usePRDStore((s) => s.setPendingIdea);

  const [idea, setIdea] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState('');
  const [customEngines, setCustomEngines] = useState<CustomEngine[]>([]);
  const [engineDialogOpen, setEngineDialogOpen] = useState(false);
  const [newEngineName, setNewEngineName] = useState('');
  const [newEngineId, setNewEngineId] = useState('');
  const [newEngineBaseUrl, setNewEngineBaseUrl] = useState('');
  const [newEngineApiKey, setNewEngineApiKey] = useState('');
  const [newEngineCompat, setNewEngineCompat] = useState<'openai' | 'anthropic'>('openai');

  // Persist custom engines to localStorage — survive browser close.
  const [enginesHydrated, setEnginesHydrated] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(ENGINES_LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setCustomEngines(parsed);
            // Auto-select the first saved engine.
            if (parsed[0]?.id) setSelectedModel(parsed[0].id);
          }
        }
      } catch {
        // localStorage unavailable — keep defaults
      }
      setEnginesHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!enginesHydrated) return;
    localStorage.setItem(ENGINES_LS_KEY, JSON.stringify(customEngines));
  }, [customEngines, enginesHydrated]);

  const handleSubmit = useCallback(() => {
    if (idea.trim().length < 20) {
      setError('Ceritakan idemu minimal 20 karakter.');
      return;
    }
    const engine = customEngines.find((e) => e.id === selectedModel);
    if (!engine) {
      setError('Tambahkan dan pilih AI Engine dulu.');
      return;
    }
    setError(null);

    const modelId = selectedModel;
    setPendingIdea(idea.trim(), engine.name, {
      baseUrl: engine.baseUrl,
      apiKey: engine.apiKey,
      compat: engine.compat,
    });

    const workspaceId = `plan-${Date.now()}`;
    router.push(`/workspace/${workspaceId}?generate=true&model=${encodeURIComponent(modelId)}`);
  }, [idea, selectedModel, customEngines, router, setPendingIdea]);

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="stagger-reveal stagger-1 mb-10 flex items-center gap-4">
          <Button variant="ghost" size="icon" render={<Link href="/dashboard" />} className="hover:bg-ink/5">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint">Perencanaan Baru</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Mau bikin apa?</h1>
          </div>
        </div>

        <div className="space-y-8">
          {/* Idea input */}
          <section className="perf-ticket stagger-reveal stagger-2 p-7 pl-9">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-ink">Ceritakan idemu</h2>
              <p className="mt-1 text-sm text-ink-dim">
                Tulis dengan bahasa sehari-hari. AI akan memecahnya jadi struktur fitur, PRD, lalu daftar task
                yang bisa langsung dikerjakan.
              </p>
            </div>

            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="cth: Aku mau bikin website toko online buat jualan sepatu..."
              className="min-h-[160px] resize-none border-border-paper bg-paper-raised text-base leading-relaxed focus-visible:ring-primary"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between">
              {error ? (
                <p className="text-xs text-stamp">{error}</p>
              ) : (
                <p className={cn('font-mono text-xs', idea.trim().length < 20 ? 'text-ink-faint' : 'text-primary')}>
                  {idea.trim().length} karakter
                </p>
              )}
            </div>
          </section>

          {/* AI Engine selector */}
          <section className="perf-ticket stagger-reveal stagger-3 p-6 pl-8">
            <div className="mb-5 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <Zap className="size-4 text-primary" />
                <h2 className="text-lg font-bold text-ink">AI Engine</h2>
              </div>
              <button
                type="button"
                onClick={() => setEngineDialogOpen(true)}
                className="flex items-center gap-1 rounded-md border border-border-paper bg-paper-raised px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
              >
                + Tambah Engine
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {customEngines.map((eng) => (
                <button
                  key={eng.id}
                  type="button"
                  onClick={() => setSelectedModel(eng.id)}
                  className={cn(
                    'group relative rounded-md border p-3.5 text-left transition-all',
                    selectedModel === eng.id
                      ? 'border-primary/40 bg-primary/10 shadow-sm ring-1 ring-primary/20'
                      : 'border-border-paper bg-paper-raised hover:border-ink-faint hover:bg-muted'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-medium',
                        selectedModel === eng.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-ink-dim'
                      )}
                    >
                      {eng.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-semibold', selectedModel === eng.id ? 'text-primary' : 'text-ink')}>
                        {eng.name}
                      </p>
                      <p className="font-mono text-[10px] text-ink-faint">{eng.model}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {customEngines.length === 0 && (
              <button
                type="button"
                onClick={() => setEngineDialogOpen(true)}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-paper bg-paper-raised/50 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted"
              >
                <Zap className="size-5 text-ink-faint" />
                <p className="text-sm font-medium text-ink">Belum ada AI Engine</p>
                <p className="max-w-xs text-xs text-ink-dim">
                  Tambahkan engine sendiri — masukkan Model ID, Base URL, dan API Key dari provider kompatibel OpenAI/Anthropic.
                </p>
                <span className="mt-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                  + Tambah Engine
                </span>
              </button>
            )}
          </section>

          {/* CTA */}
          <Button
            onClick={handleSubmit}
            size="lg"
            className="stagger-reveal stagger-4 btn-goo h-12 w-full gap-2.5 rounded-md bg-primary font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg"
          >
            <Sparkles className="size-4" />
            Mulai Perencanaan
          </Button>
        </div>

      {/* Add Engine Dialog */}
      <Dialog open={engineDialogOpen} onOpenChange={setEngineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah AI Engine</DialogTitle>
            <DialogDescription>Tambahkan endpoint model kompatibel OpenAI/Anthropic milikmu sendiri.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">Nama Engine</Label>
              <Input
                value={newEngineName}
                onChange={(e) => setNewEngineName(e.target.value)}
                placeholder="cth: Coding, Claude 4 Opus"
                className="border-border-paper bg-paper-raised focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">Model ID</Label>
              <Input
                value={newEngineId}
                onChange={(e) => setNewEngineId(e.target.value)}
                placeholder="cth: Coding, qwen35-plus"
                className="border-border-paper bg-paper-raised font-mono focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">Base URL (opsional)</Label>
              <Input
                value={newEngineBaseUrl}
                onChange={(e) => setNewEngineBaseUrl(e.target.value)}
                placeholder="cth: http://localhost:20128/v1 (default)"
                className="border-border-paper bg-paper-raised font-mono focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">API Key (opsional)</Label>
              <Input
                type="password"
                value={newEngineApiKey}
                onChange={(e) => setNewEngineApiKey(e.target.value)}
                placeholder="Optional — override env key"
                className="border-border-paper bg-paper-raised font-mono focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">Kompatibilitas API</Label>
              <Select value={newEngineCompat} onValueChange={(v) => setNewEngineCompat((v ?? 'openai') as 'openai' | 'anthropic')}>
                <SelectTrigger className="border-border-paper bg-paper-raised">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="border-border-paper text-ink-dim hover:bg-muted"
                onClick={() => {
                  setEngineDialogOpen(false);
                  setNewEngineName('');
                  setNewEngineId('');
                  setNewEngineBaseUrl('');
                  setNewEngineApiKey('');
                  setNewEngineCompat('openai');
                }}
              >
                Batal
              </Button>
              <Button
                onClick={() => {
                  if (!newEngineName.trim() || !newEngineId.trim()) return;
                  const id = newEngineId.trim();
                  setCustomEngines((prev) => [
                    ...prev,
                    {
                      id,
                      name: newEngineName.trim(),
                      model: id,
                      baseUrl: newEngineBaseUrl.trim() || undefined,
                      apiKey: newEngineApiKey.trim() || undefined,
                      compat: newEngineCompat,
                    },
                  ]);
                  setSelectedModel(id);
                  setEngineDialogOpen(false);
                  setNewEngineName('');
                  setNewEngineId('');
                  setNewEngineBaseUrl('');
                  setNewEngineApiKey('');
                  setNewEngineCompat('openai');
                }}
                disabled={!newEngineName.trim() || !newEngineId.trim()}
              >
                Tambah &amp; pakai
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
