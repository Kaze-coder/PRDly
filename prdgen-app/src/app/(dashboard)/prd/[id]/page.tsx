'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, Download, ChevronDown, Share2, MessageSquare, Send, X, Printer, Link2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionCard } from '@/components/prd/SectionCard';
import { VersionHistory } from '@/components/prd/VersionHistory';
import { generateFullMarkdown, copyToClipboard, downloadMarkdown } from '@/lib/export';
import { exportPRDToPdf } from '@/lib/pdf';
import { MOCK_PRDS } from '@/lib/mock-data';
import { parseSSEStream } from '@/lib/ai/stream';
import { usePRDStore } from '@/stores/prd-store';
import { PRD_SECTIONS } from '@/types';
import { getModelById } from '@/lib/ai/models';
import { cn } from '@/lib/utils';
import type { PRD, PRDContent, PRDSectionKey, PRDStatus } from '@/types';
import type { RefineStreamEvent } from '@/types/refine';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STATUS_STAMP: Record<PRDStatus, string> = {
  draft: 'border-ink-faint text-ink-faint',
  generating: 'border-primary text-primary',
  completed: 'border-primary text-primary',
  failed: 'border-stamp text-stamp',
};

export default function PRDEditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const prdId = params.id as string;
  const shouldGenerate = searchParams.get('generate') === 'true';
  const modelParam = searchParams.get('model') ?? 'gemini-flash';

  // Find existing mock PRD or create new
  const basePRD = MOCK_PRDS.find((p) => p.id === prdId);

  const [title, setTitle] = useState(basePRD?.title ?? 'PRD Baru');
  const [editingTitle, setEditingTitle] = useState(false);
  const [status, setStatus] = useState<PRDStatus>(basePRD?.status ?? 'draft');
  const [content, setContent] = useState<Partial<PRDContent>>(basePRD?.content ?? {});
  const [streamingSection, setStreamingSection] = useState<PRDSectionKey | null>(null);
  const [progress, setProgress] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<PRDSectionKey | null>(null);

  // DB persistence: null = not yet saved / pure mock page
  const [savedId, setSavedId] = useState<string | null>(null);
  const clearPendingGeneration = usePRDStore((s) => s.clearPendingGeneration);

  // Chat
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hai! Pilih section target di kiri atas panel, lalu ketik instruksi — misal "buat lebih ringkas" atau "tambahkan kolom retry".' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [targetSection, setTargetSection] = useState<PRDSectionKey>('executive_summary');
  const [quote, setQuote] = useState<{ text: string; section: PRDSectionKey } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const model = getModelById(modelParam);
  const displayModelName = model?.name ?? modelParam;

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Selection popup — floating "Tanya AI" muncul saat user highlight text di editor area.
  const [selPopup, setSelPopup] = useState<{ text: string; section: PRDSectionKey; x: number; y: number } | null>(null);
  const selPopupRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 10) return;
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const card = anchor?.closest?.('[data-section-key]');
      if (!card) return;
      const sectionKey = card.getAttribute('data-section-key') as PRDSectionKey | null;
      if (!sectionKey) return;

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const editorEl = editorScrollRef.current;
      if (!editorEl) return;
      const editorRect = editorEl.getBoundingClientRect();

      setSelPopup({
        text: text.slice(0, 500),
        section: sectionKey,
        x: rect.left - editorRect.left + editorEl.scrollLeft + rect.width / 2,
        y: rect.top - editorRect.top + editorEl.scrollTop - 8,
      });
    }

    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  // Hide popup on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (selPopup && selPopupRef.current && !selPopupRef.current.contains(e.target as Node)) {
        setSelPopup(null);
        window.getSelection()?.removeAllRanges();
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [selPopup]);

  function askAboutSelection() {
    if (!selPopup) return;
    setQuote({ text: selPopup.text, section: selPopup.section });
    setTargetSection(selPopup.section);
    setChatOpen(true);
    setChatInput((prev) => (prev.trim() ? prev : ''));
    setSelPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  // Latest snapshots for async work (save) that must read stable values.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Load persisted PRD from the DB when this is not a "generate" jump.
  useEffect(() => {
    if (shouldGenerate) return;
    let cancelled = false;
    fetch(`/api/prd/${prdId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        const p = json.data;
        setTitle(p.title ?? 'PRD Baru');
        setStatus(p.status ?? 'draft');
        setContent(p.content ?? {});
        setSavedId(p.id);
      })
      .catch(() => {
        /* keep mock/basePRD fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [prdId, shouldGenerate]);

  // Debounced save of manual edits (only when we have a DB id and are not streaming).
  const lastSavedSnapshot = useRef<string>('');
  useEffect(() => {
    if (!savedId || isStreaming) return;
    const snapshot = JSON.stringify({ title, content, status });
    if (snapshot === lastSavedSnapshot.current) return;
    const tid = setTimeout(() => {
      lastSavedSnapshot.current = snapshot;
      fetch(`/api/prd/${savedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, status, model_used: modelParam }),
      }).catch(() => toast.add({ title: 'Gagal menyimpan', type: 'error' }));
    }, 800);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, status, savedId, isStreaming]);

  async function saveToDb(finalStatus: PRDStatus, finalContent: Partial<PRDContent>) {
    try {
      const res = await fetch('/api/prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: null,
          status: finalStatus,
          content: finalContent,
          model_used: modelParam,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const realId = json?.data?.id;
        if (realId) {
          setSavedId(realId);
          lastSavedSnapshot.current = JSON.stringify({ title, content: finalContent, status: finalStatus });
          // Switch the URL to the real DB id so refresh loads the saved doc.
          // router.replace triggers the load-on-mount effect with the real id,
          // so sections stay intact as long as the DB write succeeded.
          router.replace(`/prd/${realId}`);
        }
    } catch (err) {
      toast.add({
        title: 'Gagal menyimpan ke database',
        description: err instanceof Error ? err.message : 'Konten tetap bisa di-copy/export manual.',
        type: 'error',
      });
    }
  }

  useEffect(() => {
    if (!shouldGenerate) return;

    const controller = new AbortController();

    // Capture the pending input/model at effect-start time so that
    // clearPendingGeneration (or StrictMode double-mount) can't null them
    // while the fetch is in flight.
    const capturedInput = usePRDStore.getState().pendingInput;
    const capturedModel = usePRDStore.getState().pendingModel;
    const capturedEngine = usePRDStore.getState().pendingEngine;

    async function generate() {
      setIsStreaming(true);
      setStatus('generating');
      setProgress(0);
      const productName = capturedInput?.product_name?.trim();
      if (productName) setTitle(productName);

      try {
        const res = await fetch('/api/prd/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model_id: capturedModel ?? modelParam,
            input: capturedInput ?? undefined,
            base_url: capturedEngine?.baseUrl,
            api_key: capturedEngine?.apiKey,
            compat: capturedEngine?.compat,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        for await (const event of parseSSEStream(res)) {
          if (controller.signal.aborted) break;
          switch (event.type) {
            case 'section_start':
              setStreamingSection(event.section);
              setThinking(false);
              setContent((prev) => ({ ...prev, [event.section]: '' }));
              break;
            case 'token':
              setThinking(false);
              setContent((prev) => ({
                ...prev,
                [streamingSectionRef.current ?? 'executive_summary']:
                  (prev[streamingSectionRef.current ?? 'executive_summary'] ?? '') + event.content,
              }));
              break;
            case 'thinking':
              setThinking(true);
              break;
            case 'section_end':
              setStreamingSection(null);
              const idx = PRD_SECTIONS.findIndex((s) => s.key === event.section);
              if (idx >= 0) setProgress(Math.round(((idx + 1) / PRD_SECTIONS.length) * 100));
              break;
            case 'done':
              break;
            case 'error':
              toast.add({ title: 'Generate gagal', description: event.message, type: 'error' });
              break;
          }
        }

        // DON'T mark as completed if the effect was aborted (e.g. by React
        // StrictMode double-mount in dev). Returning early means the second
        // mount (or re-enable) still has pendingInput in the store.
        if (!controller.signal.aborted) {
          setProgress(100);
          setStreamingSection(null);
          setThinking(false);
          setStatus('completed');
          clearPendingGeneration();
          toast.add({ title: 'PRD selesai!', description: 'PRD berhasil di-generate.', type: 'success' });
          // Persist to database after the stream completes.
          void saveToDb('completed', contentRef.current);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setThinking(false);
          setStatus('failed');
          toast.add({
            title: 'Generate gagal',
            description: err instanceof Error ? err.message : 'Terjadi kesalahan',
            type: 'error',
          });
        }
      } finally {
        setThinking(false);
        setIsStreaming(false);
      }
    }

    generate();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGenerate]);

  // Keep a ref to the currently-streaming section for token appends.
  const streamingSectionRef = useRef<PRDSectionKey | null>(null);
  useEffect(() => {
    streamingSectionRef.current = streamingSection;
  }, [streamingSection]);

  // Stable per-section callbacks so SectionCard's memo survives token-by-token streaming.
  const sectionHandlers = useMemo(() => {
    const m = new Map<PRDSectionKey, (v: string) => void>();
    for (const s of PRD_SECTIONS) {
      m.set(s.key, (v) => setContent((prev) => ({ ...prev, [s.key]: v })));
    }
    return m;
  }, [setContent]);

  function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const sectionContent = content[targetSection] ?? '';
    if (!sectionContent.trim()) {
      toast.add({ title: 'Section masih kosong', description: 'Section target belum punya konten untuk direfine.', type: 'error' });
      return;
    }

    const userMsg = quote
      ? `Perhatikan bagian ini:\n> ${quote.text.slice(0, 300)}${quote.text.length > 300 ? '…' : ''}\n\n${text}`
      : text;

    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setQuote(null);
    setChatError(null);
    setChatLoading(true);

    void refine(targetSection, text, quote?.text, sectionContent);
  }

  async function refine(sectionKey: PRDSectionKey, instruction: string, selection: string | undefined, sectionContent: string) {
    const controller = new AbortController();
    try {
      // Custom-engine override: match stored engine by id / model / name against modelParam.
      let engineBody: { base_url: string; api_key: string; compat: string } | null = null;
      try {
        if (typeof window !== 'undefined' && modelParam) {
          const raw = localStorage.getItem('prdgen.customEngines');
          const engines = raw ? JSON.parse(raw) : [];
          if (Array.isArray(engines)) {
            const match = engines.find((e) =>
              e && (e.id === modelParam || e.model === modelParam || e.name === modelParam)
            );
            if (match?.baseUrl && match?.apiKey) {
              engineBody = { base_url: match.baseUrl, api_key: match.apiKey, compat: match.compat ?? 'openai' };
            }
          }
        }
      } catch {
        // localStorage unavailable / malformed — fall back to server env providers
      }

      const res = await fetch('/api/prd/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelParam,
          section_key: sectionKey,
          content: sectionContent,
          instruction,
          selection,
          ...(engineBody ?? {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let refined = '';
      for await (const raw of parseSSEStream(res)) {
        if (controller.signal.aborted) break;
        const ev = raw as unknown as RefineStreamEvent;
        if (ev.type === 'token') {
          refined += ev.content;
          setContent((prev) => ({ ...prev, [sectionKey]: refined }));
        } else if (ev.type === 'done') {
          break;
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Section "${PRD_SECTIONS.find((s) => s.key === sectionKey)?.title}" sudah diupdate. Periksa hasilnya di editor.` },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setChatError(message);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Gagal merefine: ${message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function regenerateSection(sectionKey: PRDSectionKey) {
    if (isStreaming || regeneratingSection) return;
    const sectionContent = content[sectionKey] ?? '';
    if (!sectionContent.trim()) return;

    setRegeneratingSection(sectionKey);
    const controller = new AbortController();
    try {
      // Custom-engine override: match stored engine by id / model / name against modelParam.
      let engineBody: { base_url: string; api_key: string; compat: string } | null = null;
      try {
        if (typeof window !== 'undefined' && modelParam) {
          const raw = localStorage.getItem('prdgen.customEngines');
          const engines = raw ? JSON.parse(raw) : [];
          if (Array.isArray(engines)) {
            const match = engines.find((e) =>
              e && (e.id === modelParam || e.model === modelParam || e.name === modelParam)
            );
            if (match?.baseUrl && match?.apiKey) {
              engineBody = { base_url: match.baseUrl, api_key: match.apiKey, compat: match.compat ?? 'openai' };
            }
          }
        }
      } catch {
        // localStorage unavailable / malformed — fall back to server env providers
      }

      const res = await fetch('/api/prd/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelParam,
          section_key: sectionKey,
          content: sectionContent,
          instruction:
            'Tulis ulang section ini dari awal — lebih detail, lebih terstruktur, dan lebih spesifik berdasarkan konteks produk. Pertahankan format markdown.',
          ...(engineBody ?? {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let regenerated = '';
      for await (const raw of parseSSEStream(res)) {
        if (controller.signal.aborted) break;
        const ev = raw as unknown as RefineStreamEvent;
        if (ev.type === 'token') {
          regenerated += ev.content;
          setContent((prev) => ({ ...prev, [sectionKey]: regenerated }));
        } else if (ev.type === 'done') {
          break;
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }

      toast.add({
        title: 'Section diregenerate',
        description: `"${PRD_SECTIONS.find((s) => s.key === sectionKey)?.title}" selesai ditulis ulang.`,
        type: 'success',
      });
    } catch (err) {
      toast.add({
        title: 'Regenerate gagal',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        type: 'error',
      });
    } finally {
      setRegeneratingSection(null);
    }
  }

  // Stable per-section regenerate callbacks so SectionCard's memo survives.
  const regenerateHandlers = useMemo(() => {
    const m = new Map<PRDSectionKey, () => void>();
    for (const s of PRD_SECTIONS) {
      m.set(s.key, () => void regenerateSection(s.key));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isStreaming, regeneratingSection, modelParam]);

  const prdObj: PRD = {
    id: prdId,
    user_id: 'user-mock',
    title,
    description: null,
    status,
    content: content as PRDContent,
    markdown_content: null,
    model_used: modelParam,
    created_at: basePRD?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  async function handleCopy() {
    const md = generateFullMarkdown(prdObj);
    const ok = await copyToClipboard(md);
    toast.add({ title: ok ? 'Tersalin!' : 'Gagal menyalin', description: ok ? 'Markdown berhasil disalin ke clipboard.' : 'Tidak bisa menyalin.', type: ok ? 'success' : 'error' });
  }

  function handleDownload() {
    const md = generateFullMarkdown(prdObj);
    downloadMarkdown(md, `${title.replace(/\s+/g, '-').toLowerCase()}.md`);
    toast.add({ title: 'Download dimulai', description: 'File .md sedang didownload.', type: 'info' });
  }

  const [pdfBusy, setPdfBusy] = useState(false);

  async function handleDownloadPDF() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      // Reuse the already-rendered markdown HTML from the editor so the PDF
      // matches what the user sees (including mermaid diagrams).
      const parts: string[] = [];
      for (const section of PRD_SECTIONS) {
        const card = document.querySelector(`[data-section-key="${section.key}"]`);
        const body = card?.querySelector('.markdown-body');
        if (!body || !body.textContent?.trim()) continue;
        parts.push(
          `<div class="pdf-section"><h2>${section.title}</h2><div class="markdown-body">${body.innerHTML}</div></div>`
        );
      }
      if (!parts.length) {
        toast.add({ title: 'Tidak ada konten', description: 'PRD belum punya konten untuk diexport.', type: 'error' });
        return;
      }
      await exportPRDToPdf({ title, created_at: prdObj.created_at }, parts.join('\n'));
      toast.add({ title: 'PDF didownload', description: 'File PDF berhasil dibuat.', type: 'success' });
    } catch (err) {
      toast.add({
        title: 'Export PDF gagal',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        type: 'error',
      });
    } finally {
      setPdfBusy(false);
    }
  }

  const [shareOpen, setShareOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  async function openShare() {
    setShareOpen(true);
    setCopiedLink(false);
    if (generatedUrl) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/prd/${prdId}/share`, { method: 'POST' });
      const data = await res.json();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setGeneratedUrl(`${origin}${data.url}`);
    } catch {
      toast.add({ title: 'Gagal membuat link', type: 'error' });
    } finally {
      setSharing(false);
    }
  }

  async function copyShareLink() {
    if (!generatedUrl) return;
    const ok = await copyToClipboard(generatedUrl);
    setCopiedLink(ok);
    if (ok) toast.add({ title: 'Link disalin!', type: 'success' });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-paper bg-paper px-4 py-2.5">
        <Button variant="ghost" size="icon-sm" render={<Link href="/dashboard" />}>
          <ArrowLeft className="size-4" />
        </Button>

        {editingTitle ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
            className="max-w-xs border-border-paper bg-paper-raised text-sm font-semibold focus-visible:ring-primary"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="text-sm font-semibold text-ink hover:underline"
          >
            {title}
          </button>
        )}

        <span className={cn('stamp', STATUS_STAMP[status])}>
          {status.toUpperCase()}
        </span>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="gap-1.5">
                Export
                <ChevronDown className="size-3" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopy}>
              <Copy className="size-3.5" />
              Copy Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="size-3.5" />
              Download .md
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadPDF} disabled={pdfBusy || isStreaming}>
              <Printer className="size-3.5" />
              {pdfBusy ? 'Membuat PDF...' : 'Download PDF'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" className="gap-1.5" onClick={openShare}>
          <Share2 className="size-3.5" />
          Share
        </Button>

        <VersionHistory />

        {/* Mobile chat toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => setChatOpen(!chatOpen)}
        >
          <MessageSquare className="size-4" />
        </Button>
      </div>

      {/* Progress bar during streaming */}
      {isStreaming && (
        <div className="shrink-0 border-b border-border-paper bg-paper px-4 py-2">
          <Progress value={progress}>
            <ProgressLabel className="font-mono text-xs text-ink-faint">
              {thinking
                ? 'Model sedang berpikir...'
                : streamingSection
                  ? `Menulis: ${PRD_SECTIONS.find((s) => s.key === streamingSection)?.title}...`
                  : 'Memproses...'}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
        </div>
      )}
      {/* Per-section regenerate is driven by SectionCard's onRegenerate prop */}
      {regeneratingSection && (
        <div className="shrink-0 border-b border-border-paper bg-paper-soft px-4 py-1.5 font-mono text-xs text-primary">
          Menulis ulang: {PRD_SECTIONS.find((s) => s.key === regeneratingSection)?.title}…
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="relative flex-1 overflow-y-auto bg-paper-raised p-4 sm:p-8" ref={editorScrollRef}>
          <div className="mx-auto max-w-3xl space-y-6">
            {PRD_SECTIONS.map((section) => (
              <SectionCard
                key={section.key}
                title={section.title}
                sectionKey={section.key}
                content={content[section.key] ?? ''}
                isStreaming={streamingSection === section.key}
                onContentChange={sectionHandlers.get(section.key)}
                onRegenerate={regenerateHandlers.get(section.key)}
                isRegenerating={regeneratingSection === section.key}
              />
            ))}
          </div>
          {selPopup && (
            <div
              ref={selPopupRef}
              className="absolute z-50"
              style={{ left: `${selPopup.x}px`, top: `${selPopup.y}px`, transform: 'translate(-50%, -100%)' }}
            >
              <button
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-colors hover:bg-accent/90"
                onMouseDown={askAboutSelection}
              >
                <MessageSquare className="size-3.5" />
                Tanya AI
              </button>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        <div
          className={cn(
            'flex w-80 shrink-0 flex-col border-l border-border-paper bg-paper transition-all',
            chatOpen ? 'translate-x-0' : 'translate-x-full',
            'max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:shadow-xl',
            !chatOpen && 'max-lg:pointer-events-none'
          )}
        >
          <div className="flex items-center justify-between border-b border-border-paper bg-paper px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">Chat Refine</h3>
              <span className="stamp hidden text-[9px] lg:inline-flex">{displayModelName}</span>
            </div>
            <Button variant="ghost" size="icon-xs" className="lg:hidden" onClick={() => setChatOpen(false)}>
              <X className="size-3.5" />
            </Button>
          </div>

          <div className="border-b border-border-paper bg-paper px-3 py-2">
            <Select value={targetSection} onValueChange={(v) => setTargetSection(v as PRDSectionKey)}>
              <SelectTrigger className="h-8 border-border-paper bg-paper-raised text-xs focus:ring-primary">
                <SelectValue placeholder="Pilih section target" />
              </SelectTrigger>
              <SelectContent>
                {PRD_SECTIONS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto bg-paper-raised/50 p-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[90%] rounded-xl px-3 py-2 text-sm',
                  msg.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'bg-muted text-ink'
                )}
              >
                {msg.content}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-border-paper p-3">
            {quote && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-border-paper bg-muted/60 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                    {PRD_SECTIONS.find((s) => s.key === quote.section)?.title}
                  </p>
                  <p className="mt-0.5 line-clamp-3 font-mono text-[11px] text-ink-dim">
                    &ldquo;{quote.text}&rdquo;
                  </p>
                </div>
                <button className="shrink-0 text-ink-faint hover:text-ink" onClick={() => setQuote(null)}>
                  <X className="size-3" />
                </button>
              </div>
            )}
            {chatError && (
              <p className="mb-2 font-mono text-[10px] text-stamp">{chatError}</p>
            )}
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder={quote ? 'Instruksi untuk kutipan ini...' : 'Ketik instruksi refine...'}
                className="flex-1 border-border-paper bg-paper-raised focus-visible:ring-primary"
                disabled={chatLoading || isStreaming}
              />
              <Button size="icon" onClick={sendChat} disabled={!chatInput.trim() || chatLoading || isStreaming}>
                {chatLoading ? <MessageSquare className="size-3.5 animate-pulse" /> : <Send className="size-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="shrink-0 border-t border-border-paper bg-muted px-4 py-2 font-mono text-xs text-ink-dim">
        <span className="mr-4">+ TERSIMPAN</span>
        Dibuat: {new Date(prdObj.created_at).toLocaleString('id-ID')}
        <span className="mx-3 text-ink-faint">|</span>
        Model: <span className="text-primary">{displayModelName}</span>
      </div>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bagikan PRD</DialogTitle>
            <DialogDescription>
              Siapa saja dengan link ini dapat melihat PRD Anda (read-only). Link bisa dinonaktifkan kapan saja.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border-paper bg-muted px-3 py-2 text-sm text-ink-dim">
              <Link2 className="size-4 shrink-0" />
              <span className="truncate">{sharing ? 'Membuat link...' : generatedUrl}</span>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={copyShareLink} disabled={sharing || !generatedUrl}>
              {copiedLink ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copiedLink ? 'Tersalin' : 'Salin'}
            </Button>
          </div>
          {generatedUrl && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              render={<Link href={generatedUrl.replace(/^https?:\/\/[^/]+/, '')} target="_blank" />}
            >
              Buka Pratinjau Publik
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
