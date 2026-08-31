'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Zap, Trash2, Pencil, Paperclip, X, Loader2, FileText, AlertCircle, PlugZap } from 'lucide-react';
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

interface Attachment {
  id: string;
  name: string;
  size: number;
  status: 'extracting' | 'done' | 'error';
  text?: string;
  chars?: number;
  error?: string;
}

interface TestResult {
  status: 'testing' | 'ok' | 'fail';
  latencyMs?: number;
  error?: string;
}

const ATTACHMENT_ACCEPT =
  '.pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tiff,image/*';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCharsShort(chars: number): string {
  if (chars < 1000) return `${chars}`;
  return `${(chars / 1000).toFixed(1)}k`;
}

export default function NewPlanPage() {
  const router = useRouter();
  const setPendingIdea = usePRDStore((s) => s.setPendingIdea);

  const [idea, setIdea] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedModel, setSelectedModel] = useState('');
  const [customEngines, setCustomEngines] = useState<CustomEngine[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(true);
  const [savingEngine, setSavingEngine] = useState(false);
  const [engineDialogOpen, setEngineDialogOpen] = useState(false);
  const [editingEngineId, setEditingEngineId] = useState<string | null>(null);
  const [newEngineName, setNewEngineName] = useState('');
  const [newEngineId, setNewEngineId] = useState('');
  const [newEngineBaseUrl, setNewEngineBaseUrl] = useState('');
  const [newEngineApiKey, setNewEngineApiKey] = useState('');
  const [newEngineCompat, setNewEngineCompat] = useState<'openai' | 'anthropic'>('openai');

  // Per-engine "Test Connection" state, keyed by engine id.
  const [testing, setTesting] = useState<Record<string, TestResult | undefined>>({});
  // Test state for the unsaved config inside the Add/Edit dialog.
  const [dialogTest, setDialogTest] = useState<TestResult | null>(null);

  // Load the user's engines from the database (encrypted at rest, decrypted here).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/engines')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        if (cancelled) return;
        const list = Array.isArray(json?.data) ? (json.data as CustomEngine[]) : [];
        setCustomEngines(list);
        if (list[0]?.id) setSelectedModel(list[0].id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEnginesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const batch: Attachment[] = files.map((f) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: f.size,
      status: 'extracting',
    }));
    setAttachments((prev) => [...prev, ...batch]);

    const form = new FormData();
    files.forEach((f) => form.append('files', f));

    fetch('/api/extract', { method: 'POST', body: form })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) {
          const msg = (json?.error as string) ?? 'Gagal mengekstrak lampiran.';
          setAttachments((prev) =>
            prev.map((a) =>
              batch.some((b) => b.id === a.id) ? { ...a, status: 'error', error: msg } : a
            )
          );
          return;
        }
        const resultFiles = (json.data.files ?? []) as Array<{
          name: string;
          chars: number;
          kind: string;
          error?: string;
        }>;
        setAttachments((prev) =>
          prev.map((a) => {
            const idx = batch.findIndex((b) => b.id === a.id);
            if (idx === -1) return a;
            const result = resultFiles[idx] ?? resultFiles.find((r) => r.name === a.name);
            if (!result) {
              return { ...a, status: 'error', error: 'Tidak ada hasil ekstraksi.' };
            }
            if (result.error) {
              return { ...a, status: 'error', error: result.error };
            }
            // The API returns one combined text; slice out this file's portion by marker.
            const marker = `--- ${result.name} ---`;
            const combined = (json.data.text as string) ?? '';
            const start = combined.indexOf(marker);
            let text = '';
            if (start !== -1) {
              const afterMarker = start + marker.length;
              const nextMarker = combined.indexOf('\n--- ', afterMarker);
              text = combined.slice(afterMarker, nextMarker === -1 ? undefined : nextMarker).trim();
            }
            return {
              ...a,
              status: 'done',
              chars: result.chars,
              text: text || combined,
            };
          })
        );
      })
      .catch(() => {
        setAttachments((prev) =>
          prev.map((a) =>
            batch.some((b) => b.id === a.id)
              ? { ...a, status: 'error', error: 'Terjadi kesalahan jaringan.' }
              : a
          )
        );
      });
  }, []);

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  }

  const handleSubmit = useCallback(() => {
    if (idea.trim().length < 20) {
      setError('Ceritakan idemu minimal 20 karakter.');
      return;
    }
    if (attachments.some((a) => a.status === 'extracting')) {
      setError('Tunggu ekstraksi lampiran selesai.');
      return;
    }
    const engine = customEngines.find((e) => e.id === selectedModel);
    if (!engine) {
      setError('Tambahkan dan pilih AI Engine dulu.');
      return;
    }
    setError(null);

    const attachmentText = attachments
      .filter((a) => a.status === 'done' && a.text)
      .map((a) => `\n\n--- Lampiran: ${a.name} ---\n${a.text}`)
      .join('');
    const fullIdea = `${idea.trim()}${attachmentText}`;

    const modelId = engine.model || selectedModel;
    setPendingIdea(fullIdea, engine.name, {
      baseUrl: engine.baseUrl,
      apiKey: engine.apiKey,
      compat: engine.compat,
    });

    const workspaceId = `plan-${Date.now()}`;
    router.push(`/workspace/${workspaceId}?generate=true&model=${encodeURIComponent(modelId)}`);
  }, [idea, attachments, selectedModel, customEngines, router, setPendingIdea]);

  function resetEngineForm() {
    setEngineDialogOpen(false);
    setEditingEngineId(null);
    setNewEngineName('');
    setNewEngineId('');
    setNewEngineBaseUrl('');
    setNewEngineApiKey('');
    setNewEngineCompat('openai');
    setDialogTest(null);
  }

  function openEditEngine(eng: CustomEngine) {
    setEditingEngineId(eng.id);
    setNewEngineName(eng.name);
    setNewEngineId(eng.model);
    setNewEngineBaseUrl(eng.baseUrl ?? '');
    setNewEngineApiKey(eng.apiKey ?? '');
    setNewEngineCompat(eng.compat);
    setDialogTest(null);
    setEngineDialogOpen(true);
  }

  async function saveEngine() {
    if (!newEngineName.trim() || !newEngineId.trim() || savingEngine) return;
    setSavingEngine(true);
    try {
      if (editingEngineId) {
        const res = await fetch('/api/engines', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingEngineId,
            name: newEngineName.trim(),
            model: newEngineId.trim(),
            baseUrl: newEngineBaseUrl.trim() || undefined,
            apiKey: newEngineApiKey.trim() || undefined,
            compat: newEngineCompat,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.data) {
          setError(json?.error ?? 'Gagal menyimpan perubahan.');
          return;
        }
        const eng = json.data as CustomEngine;
        setCustomEngines((prev) => prev.map((e) => (e.id === eng.id ? eng : e)));
        resetEngineForm();
        return;
      }
      const res = await fetch('/api/engines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newEngineName.trim(),
          model: newEngineId.trim(),
          baseUrl: newEngineBaseUrl.trim() || undefined,
          apiKey: newEngineApiKey.trim() || undefined,
          compat: newEngineCompat,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.data) {
        setError(json?.error ?? 'Gagal menyimpan engine.');
        return;
      }
      const eng = json.data as CustomEngine;
      setCustomEngines((prev) => [...prev, eng]);
      setSelectedModel(eng.id);
      resetEngineForm();
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setSavingEngine(false);
    }
  }

  async function deleteEngine(id: string) {
    setCustomEngines((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (selectedModel === id) setSelectedModel(next[0]?.id ?? '');
      return next;
    });
    await fetch(`/api/engines?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }

  async function testEngine(id: string) {
    if (testing[id]?.status === 'testing') return;
    setTesting((prev) => ({ ...prev, [id]: { status: 'testing' } }));
    try {
      const res = await fetch('/api/engines/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setTesting((prev) => ({
          ...prev,
          [id]: { status: 'fail', error: json?.error ?? 'Gagal mengetes koneksi.' },
        }));
        return;
      }
      if (json?.ok) {
        setTesting((prev) => ({ ...prev, [id]: { status: 'ok', latencyMs: json.latencyMs } }));
      } else {
        setTesting((prev) => ({
          ...prev,
          [id]: { status: 'fail', error: json?.error ?? 'Koneksi gagal.' },
        }));
      }
    } catch {
      setTesting((prev) => ({ ...prev, [id]: { status: 'fail', error: 'Terjadi kesalahan jaringan.' } }));
    }
  }

  async function testDialogConfig() {
    if (!newEngineId.trim() || dialogTest?.status === 'testing') return;
    setDialogTest({ status: 'testing' });
    try {
      const res = await fetch('/api/engines/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: newEngineId.trim(),
          baseUrl: newEngineBaseUrl.trim() || undefined,
          apiKey: newEngineApiKey.trim() || undefined,
          compat: newEngineCompat,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDialogTest({ status: 'fail', error: json?.error ?? 'Gagal mengetes koneksi.' });
        return;
      }
      if (json?.ok) {
        setDialogTest({ status: 'ok', latencyMs: json.latencyMs });
      } else {
        setDialogTest({ status: 'fail', error: json?.error ?? 'Koneksi gagal.' });
      }
    } catch {
      setDialogTest({ status: 'fail', error: 'Terjadi kesalahan jaringan.' });
    }
  }

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

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {/* Textarea + inline attach affordance + drag overlay */}
            <div
              className="relative"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                // Ignore drag-leave bubbling from children.
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setIsDragging(false);
              }}
              onDrop={onDrop}
            >
              <Textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="cth: Aku mau bikin website toko online buat jualan sepatu..."
                className="min-h-[160px] resize-none border-border-paper bg-paper-raised pb-12 text-base leading-relaxed focus-visible:ring-primary"
                autoFocus
              />

              {/* Inline attach button (Claude-style), bottom-right inside the textarea */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Tambah lampiran"
                aria-label="Tambah lampiran"
                className="absolute bottom-2.5 right-2.5 flex size-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <Paperclip className="size-4" />
              </button>

              {/* Drag-over overlay */}
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 flex items-center justify-center rounded-md ring-2 ring-inset ring-primary/60 bg-primary/10 transition-all duration-150',
                  isDragging ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                )}
              >
                <span className="rounded-md bg-paper-raised px-3 py-1.5 font-mono text-xs font-medium text-primary shadow-sm">
                  Lepaskan file untuk melampirkan
                </span>
              </div>
            </div>

            {/* Attachment chips */}
            {attachments.length > 0 && (
              <div className="mb-2 mt-3 flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <span
                    key={att.id}
                    title={
                      att.status === 'error'
                        ? `${att.name} · ${formatBytes(att.size)} · ${att.error ?? 'gagal'}`
                        : `${att.name} · ${formatBytes(att.size)}`
                    }
                    className={cn(
                      'group/chip inline-flex max-w-[220px] items-center gap-1.5 rounded-full border bg-paper-raised px-2.5 py-1 font-mono text-[11px] transition-colors animate-in fade-in zoom-in-95 duration-200',
                      att.status === 'error' ? 'border-stamp/40' : 'border-border-paper'
                    )}
                  >
                    {att.status === 'extracting' ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-dim" />
                    ) : att.status === 'error' ? (
                      <AlertCircle className="size-3.5 shrink-0 text-stamp" />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-ink-dim" />
                    )}
                    <span className="max-w-[140px] truncate text-ink">{att.name}</span>
                    {att.status === 'done' && att.chars !== undefined && (
                      <span className="shrink-0 text-primary">{formatCharsShort(att.chars)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      title="Hapus lampiran"
                      aria-label="Hapus lampiran"
                      className="flex size-4 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-stamp/10 hover:text-stamp"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-3">
              {error ? (
                <p className="text-xs text-stamp">{error}</p>
              ) : (
                <p className={cn('font-mono text-xs', idea.trim().length < 20 ? 'text-ink-faint' : 'text-primary')}>
                  {idea.trim().length} karakter
                </p>
              )}
              {attachments.length === 0 && (
                <p className="text-xs text-ink-faint">Bisa juga seret file ke sini</p>
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
                <div
                  key={eng.id}
                  className={cn(
                    'group relative rounded-md border p-3.5 transition-all',
                    selectedModel === eng.id
                      ? 'border-primary/40 bg-primary/10 shadow-sm ring-1 ring-primary/20'
                      : 'border-border-paper bg-paper-raised hover:border-ink-faint hover:bg-muted'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedModel(eng.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-medium',
                        selectedModel === eng.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-ink-dim'
                      )}
                    >
                      {eng.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 pr-16">
                      <p className={cn('text-sm font-semibold', selectedModel === eng.id ? 'text-primary' : 'text-ink')}>
                        {eng.name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-ink-faint">{eng.model}</p>
                      {testing[eng.id] && (
                        <p className="mt-1 truncate font-mono text-[10px]">
                          {testing[eng.id]?.status === 'testing' && (
                            <span className="text-ink-dim">mengetes…</span>
                          )}
                          {testing[eng.id]?.status === 'ok' && (
                            <span className="text-emerald-600">
                              ✓ Terhubung · {testing[eng.id]?.latencyMs}ms
                            </span>
                          )}
                          {testing[eng.id]?.status === 'fail' && (
                            <span className="text-stamp">✗ {testing[eng.id]?.error ?? 'gagal'}</span>
                          )}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => testEngine(eng.id)}
                      title="Test koneksi"
                      aria-label="Test koneksi"
                      className="flex size-6 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-ink/5 hover:text-primary group-hover:opacity-100"
                    >
                      {testing[eng.id]?.status === 'testing' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <PlugZap className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditEngine(eng)}
                      title="Edit engine"
                      aria-label="Edit engine"
                      className="flex size-6 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-ink/5 hover:text-ink group-hover:opacity-100"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEngine(eng.id)}
                      title="Hapus engine"
                      aria-label="Hapus engine"
                      className="flex size-6 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-stamp/10 hover:text-stamp group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {enginesLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-border-paper bg-paper-raised/50 px-4 py-8 font-mono text-xs text-ink-faint">
                Memuat engine…
              </div>
            ) : (
              customEngines.length === 0 && (
                <button
                  type="button"
                  onClick={() => setEngineDialogOpen(true)}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-paper bg-paper-raised/50 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  <Zap className="size-5 text-ink-faint" />
                  <p className="text-sm font-medium text-ink">Belum ada AI Engine</p>
                  <p className="max-w-xs text-xs text-ink-dim">
                    Tambahkan engine sendiri — masukkan Model ID, Base URL, dan API Key dari provider kompatibel OpenAI/Anthropic. Tersimpan aman di akunmu.
                  </p>
                  <span className="mt-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                    + Tambah Engine
                  </span>
                </button>
              )
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

      {/* Add / Edit Engine Dialog */}
      <Dialog open={engineDialogOpen} onOpenChange={(open) => (open ? setEngineDialogOpen(true) : resetEngineForm())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEngineId ? 'Edit AI Engine' : 'Tambah AI Engine'}</DialogTitle>
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
                onChange={(e) => {
                  setNewEngineId(e.target.value);
                  setDialogTest(null);
                }}
                placeholder="cth: Coding, qwen35-plus"
                className="border-border-paper bg-paper-raised font-mono focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">Base URL (opsional)</Label>
              <Input
                value={newEngineBaseUrl}
                onChange={(e) => {
                  setNewEngineBaseUrl(e.target.value);
                  setDialogTest(null);
                }}
                placeholder="cth: http://localhost:20128/v1 (default)"
                className="border-border-paper bg-paper-raised font-mono focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">API Key (opsional)</Label>
              <Input
                type="password"
                value={newEngineApiKey}
                onChange={(e) => {
                  setNewEngineApiKey(e.target.value);
                  setDialogTest(null);
                }}
                placeholder="Optional — override env key"
                className="border-border-paper bg-paper-raised font-mono focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">Kompatibilitas API</Label>
              <Select value={newEngineCompat} onValueChange={(v) => { setNewEngineCompat((v ?? 'openai') as 'openai' | 'anthropic'); setDialogTest(null); }}>
                <SelectTrigger className="border-border-paper bg-paper-raised">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dialogTest && (
              <p className="truncate font-mono text-xs">
                {dialogTest.status === 'testing' && <span className="text-ink-dim">mengetes…</span>}
                {dialogTest.status === 'ok' && (
                  <span className="text-emerald-600">✓ Terhubung · {dialogTest.latencyMs}ms</span>
                )}
                {dialogTest.status === 'fail' && (
                  <span className="text-stamp">✗ {dialogTest.error ?? 'gagal'}</span>
                )}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="border-border-paper text-ink-dim hover:bg-muted"
                onClick={resetEngineForm}
              >
                Batal
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 border-border-paper text-ink-dim hover:bg-muted"
                onClick={testDialogConfig}
                disabled={!newEngineId.trim() || dialogTest?.status === 'testing'}
              >
                {dialogTest?.status === 'testing' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <PlugZap className="size-3.5" />
                )}
                Test dulu
              </Button>
              <Button
                onClick={saveEngine}
                disabled={!newEngineName.trim() || !newEngineId.trim() || savingEngine}
              >
                {savingEngine ? 'Menyimpan…' : editingEngineId ? 'Simpan perubahan' : 'Tambah & pakai'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
