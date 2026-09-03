'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Sparkles,
  ArrowRight,
  Copy,
  Download,
  Printer,
  ChevronDown,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { StepperHeader } from '@/components/plan/StepperHeader';
import { MindmapCanvas } from '@/components/plan/MindmapCanvas';
import { SectionCard } from '@/components/prd/SectionCard';
import { SharedMarkdown } from '@/components/prd/SharedMarkdown';
import { parseSSEStream } from '@/lib/ai/stream';
import { generateFullMarkdown, copyToClipboard, downloadMarkdown } from '@/lib/export';
import { exportPRDToPdf } from '@/lib/pdf';
import { usePRDStore } from '@/stores/prd-store';
import { PRD_SECTIONS } from '@/types';
import { getModelById } from '@/lib/ai/models';
import { fetchEngineBody } from '@/lib/engines-client';
import { cn } from '@/lib/utils';
import type {
  PRD,
  PlanStructure,
  PlanStep,
  PlanFeature,
  PRDContent,
  PRDSectionKey,
  StreamEvent,
} from '@/types';
import type { RefineStreamEvent } from '@/types/refine';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * PRD generation waves. Sections within a wave are requested CONCURRENTLY
 * (one serverless request each, well under Vercel's 300s hard kill); waves run
 * in order so each wave's `previous` snapshot carries earlier sections for
 * cross-section ID/terminology consistency.
 */
const PRD_BATCHES: PRDSectionKey[][] = [
  ['executive_summary', 'problem_statement', 'goals_metrics', 'user_personas', 'glossary'],
  ['feature_list', 'user_stories', 'functional_requirements', 'non_functional_requirements'],
  ['system_architecture', 'data_model', 'api_specification', 'risk_assessment'],
  ['open_questions', 'diagrams', 'roadmap', 'task_breakdown'],
];

/** Remove any leaked <think>…</think> reasoning tags from model output. */
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '');
}

interface PlanEvent {
  type: string;
  content?: string;
  structure?: PlanStructure;
  features?: { id: string; tasks: PlanFeature['tasks'] }[];
  message?: string;
}

/**
 * Empty placeholder structure used to render the skeleton mindmap while the
 * real structure is still streaming. Blank names/descriptions trigger the
 * pulsing placeholder state inside MindmapCanvas's cards.
 */
const SKELETON_STRUCTURE: PlanStructure = {
  root: { title: '', overview: '', architecture: '' },
  features: [1, 2, 3].map((n) => ({
    id: `skeleton-${n}`,
    name: '',
    description: '',
    phase: n,
    subFeatures: [
      { id: `skeleton-${n}-a`, name: '', description: '' },
      { id: `skeleton-${n}-b`, name: '', description: '' },
      { id: `skeleton-${n}-c`, name: '', description: '' },
    ],
    tasks: [],
  })),
};

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const shouldGenerate = searchParams.get('generate') === 'true';
  const modelParam = searchParams.get('model') ?? 'gpt-4o';

  // The model actually used for generation. Initialized from the URL, but
  // overridden by the persisted model when an existing workspace is loaded so
  // that regenerating after a reload uses the same model.
  const [activeModel, setActiveModel] = useState(modelParam);
  const model = getModelById(activeModel);
  const displayModelName = model?.name ?? activeModel;

  const pendingIdea = usePRDStore((s) => s.pendingIdea);
  const clearPendingIdea = usePRDStore((s) => s.clearPendingIdea);

  const [idea, setIdea] = useState('');
  const [title, setTitle] = useState('Perencanaan Baru');
  const [activeStep, setActiveStep] = useState<PlanStep>('structure');
  const [completedSteps, setCompletedSteps] = useState<PlanStep[]>([]);
  const [structure, setStructure] = useState<PlanStructure | null>(null);
  const [prdContent, setPrdContent] = useState<Partial<PRDContent>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  // Phase working state
  const [structureLoading, setStructureLoading] = useState(false);
  const [prdStreaming, setPrdStreaming] = useState(false);
  const [prdSection, setPrdSection] = useState<PRDSectionKey | null>(null);
  const [prdProgress, setPrdProgress] = useState(0);
  const [thinking, setThinking] = useState(false);

  // Mirror the latest PRD content in a ref so async persist() never saves a
  // stale (empty) snapshot captured when generation started.
  const prdContentRef = useRef<Partial<PRDContent>>({});
  useEffect(() => {
    prdContentRef.current = prdContent;
  }, [prdContent]);

  // ── Chat refine panel state ──
  const [chatOpen, setChatOpen] = useState(true);
  // Separate conversation threads per mode so Tanya and Edit don't mix.
  const [askMessages, setAskMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hai! Tanya apa saja soal PRD ini — aku jawab di chat tanpa mengubah dokumen.',
    },
  ]);
  const [editMessages, setEditMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Mode Edit — pilih section target, lalu ketik instruksi (mis. "buat lebih ringkas"). Section akan ditulis ulang.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMode, setChatMode] = useState<'ask' | 'edit'>('ask');
  const [targetSection, setTargetSection] = useState<PRDSectionKey>('executive_summary');
  const [quote, setQuote] = useState<{ text: string; section: PRDSectionKey } | null>(null);

  // Active thread + its setter, chosen by mode.
  const messages = chatMode === 'ask' ? askMessages : editMessages;
  const setMessages = chatMode === 'ask' ? setAskMessages : setEditMessages;

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Selection popup — floating "Tanya AI" appears when the user highlights text
  // in the PRD editor area, letting them ask the AI about that exact quote.
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

  // Hide popup on outside click.
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
    setChatMode('ask');
    setChatOpen(true);
    setSelPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  const [pdfBusy, setPdfBusy] = useState(false);

  const markComplete = useCallback((step: PlanStep) => {
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }, []);

  // ── Load persisted workspace when not a fresh generate jump ──
  useEffect(() => {
    if (shouldGenerate) return;
    // Don't reload a document we just created/saved in this same session —
    // our in-memory state is the source of truth and a reload would clobber it
    // (and could momentarily show empty content mid-save).
    if (savedId && workspaceId === savedId) return;
    let cancelled = false;
    fetch(`/api/prd/${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        const p = json.data;
        setTitle(p.title ?? 'Perencanaan');
        setIdea(p.idea ?? '');
        if (p.model_used) setActiveModel(p.model_used);
        if (p.structure) setStructure(p.structure);
        if (p.content) setPrdContent(p.content);
        setSavedId(p.id);
        const done: PlanStep[] = [];
        if (p.structure) done.push('structure');
        if (p.content && Object.keys(p.content).length > 0) done.push('prd');
        setCompletedSteps(done);
        setActiveStep(done.includes('prd') ? 'prd' : 'structure');
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, shouldGenerate, savedId]);

  // ── Load persisted Chat Refine history once we have a DB id ──
  const chatLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!savedId || chatLoadedFor.current === savedId) return;
    chatLoadedFor.current = savedId;
    let cancelled = false;
    fetch(`/api/prd/${savedId}/chat`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        const ask = json.data.ask as ChatMessage[];
        const edit = json.data.edit as ChatMessage[];
        if (Array.isArray(ask) && ask.length > 0) setAskMessages(ask);
        if (Array.isArray(edit) && edit.length > 0) setEditMessages(edit);
      })
      .catch(() => {
        /* keep in-memory greeting */
      });
    return () => {
      cancelled = true;
    };
  }, [savedId]);

  /** Append one chat message to the DB (fire-and-forget). Needs a saved PRD. */
  const persistChat = useCallback(
    (mode: 'ask' | 'edit', role: 'user' | 'assistant', content: string) => {
      const id = savedId;
      if (!id || !content.trim()) return;
      void fetch(`/api/prd/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, role, content }),
      }).catch(() => {});
    },
    [savedId]
  );

  // ── Auto-run structure generation on generate jump ──
  const ranRef = useRef(false);
  useEffect(() => {
    if (!shouldGenerate || ranRef.current) return;
    ranRef.current = true;

    const capturedIdea = usePRDStore.getState().pendingIdea ?? pendingIdea ?? '';
    if (!capturedIdea) {
      toast.add({ title: 'Ide tidak ditemukan', description: 'Mulai lagi dari halaman baru.', type: 'error' });
      return;
    }
    setIdea(capturedIdea);
    void generateStructure(capturedIdea);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGenerate]);

  // ── Phase 1: Structure ──
  async function generateStructure(ideaText: string) {
    setStructureLoading(true);
    setActiveStep('structure');
    setThinking(false);
    const engineBody = await fetchEngineBody(activeModel);
    try {
      let received: PlanStructure | null = null;
      // Slow models sometimes die before emitting the structure event. Retry
      // once immediately; the existing !received guard reports final failure.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch('/api/plan/structure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_id: activeModel, idea: ideaText, ...(engineBody ?? {}) }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          for await (const raw of parseSSEStream(res as Response) as AsyncGenerator<StreamEvent>) {
            const ev = raw as unknown as PlanEvent;
            if (ev.type === 'thinking') setThinking(true);
            else if (ev.type === 'structure' && ev.structure) {
              setThinking(false);
              received = ev.structure;
              setStructure(ev.structure);
              setTitle(ev.structure.root.title || 'Perencanaan');
            } else if (ev.type === 'error') {
              throw new Error(ev.message ?? 'Gagal membuat struktur');
            }
          }
        } catch {
          // Attempt failed (timeout/stream error) — try once more if we haven't
          // received a structure yet.
        }
        if (received) break;
      }

      // Guard: the stream can close cleanly without ever emitting a valid
      // structure (e.g. an unknown model returns empty/invalid JSON). Don't
      // mark the step complete in that case — surface it as an error instead.
      if (!received || !Array.isArray(received.features) || received.features.length === 0) {
        throw new Error('Model tidak mengembalikan struktur yang valid. Coba model lain.');
      }

      markComplete('structure');
      clearPendingIdea();
      toast.add({ title: 'Struktur siap!', description: 'Review fitur, lalu lanjut ke PRD.', type: 'success' });
    } catch (err) {
      toast.add({
        title: 'Gagal membuat struktur',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        type: 'error',
      });
    } finally {
      setStructureLoading(false);
      setThinking(false);
    }
  }

  // ── Phase 2: PRD (grounded in structure) ──
  async function generatePRD() {
    if (!structure) return;
    setActiveStep('prd');
    setPrdStreaming(true);
    setPrdProgress(0);
    setPrdContent({});
    setThinking(false);
    const engineBody = await fetchEngineBody(activeModel);

    // Local accumulator — synchronously available for completeness checks
    // after the stream ends (state/ref may lag behind due to React batching).
    // Persists across batches so later batches send earlier sections as context.
    const contentAcc: Partial<PRDContent> = {};
    // Resume: seed the accumulator with sections already generated (e.g. from a
    // prior partial run) so a re-click of Generate only fills what's missing.
    PRD_SECTIONS.forEach((s) => {
      const v = prdContentRef.current[s.key];
      if (v?.trim()) contentAcc[s.key] = v;
    });

    // Request a single section. Runs concurrently with its wave-mates, so it
    // keeps its OWN currentSection + AbortController — sharing either would race
    // (tokens landing in the wrong section, one abort killing all requests).
    // `prevSnapshot` is captured per-wave BEFORE launch so parallel requests all
    // see the same stable `previous` context. Errors propagate to allSettled.
    async function requestSection(key: PRDSectionKey, prevSnapshot: Partial<PRDContent>) {
      let localSection: PRDSectionKey | null = null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 290_000);
      try {
        const res = await fetch('/api/prd/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model_id: activeModel,
            idea,
            structure,
            sections: [key],
            previous: prevSnapshot,
            ...(engineBody ?? {}),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        for await (const event of parseSSEStream(res)) {
          switch (event.type) {
            case 'section_start':
              // Defense in depth: a model that spills into another section must
              // not write into a sibling request's key. Ignore foreign sections.
              if (event.section !== key) break;
              localSection = event.section;
              setPrdSection(event.section);
              setThinking(false);
              contentAcc[event.section] = '';
              setPrdContent((prev) => ({ ...prev, [event.section]: '' }));
              break;
            case 'token': {
              setThinking(false);
              // Fallback to the requested key (never a shared mutable) so
              // parallel requests never cross-write each other's section.
              const k = localSection ?? key;
              contentAcc[k] = (contentAcc[k] ?? '') + event.content;
              setPrdContent((prev) => ({
                ...prev,
                [k]: (prev[k] ?? '') + event.content,
              }));
              break;
            }
            case 'thinking':
              setThinking(true);
              break;
            case 'section_end':
              if (event.section !== key) break;
              localSection = null;
              break;
            case 'error':
              // Surface server-side failures via the normal rejection path so
              // they're counted once per section and consolidated into the
              // final toast — instead of spamming one toast per failed request.
              ctrl.abort();
              throw new Error(event.message ?? 'Section gagal digenerate');
          }
        }
      } catch (err) {
        // A section that died mid-stream holds half-written garbage. Clear it so
        // the resume check (non-empty = done) re-requests it next round.
        contentAcc[key] = '';
        setPrdContent((prev) => ({ ...prev, [key]: '' }));
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    // Auto-continue: repeat the per-wave pass over still-missing sections for up
    // to MAX_ROUNDS so the user doesn't have to re-click Generate. Each round
    // runs the 4 waves in order; sections WITHIN a wave run concurrently.
    const MAX_ROUNDS = 3;
    const failed: PRDSectionKey[] = [];
    // First server-side error reason — surfaced once in the final toast so the
    // user knows WHY (auth, model missing, timeout) without per-request spam.
    let failReason = '';
    const missingKeys = () =>
      PRD_SECTIONS.filter((s) => (contentAcc[s.key] ?? '').trim().length === 0).map((s) => s.key);
    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        const missingBefore = missingKeys();
        if (round > 1) {
          // All done — stop early.
          if (missingBefore.length === 0) break;
          toast.add({
            title: 'Mencoba ulang otomatis',
            description: `${missingBefore.length} section belum selesai — ronde ${round} dari ${MAX_ROUNDS}.`,
            type: 'info',
          });
        }

        for (const wave of PRD_BATCHES) {
          // Resume: only request sections in this wave that aren't filled yet.
          const missing = wave.filter((k) => !(contentAcc[k] ?? '').trim());
          if (missing.length === 0) continue;

          // Stable snapshot shared by all requests in this wave: a request
          // completing mid-wave must NOT feed its output into a sibling's
          // `previous` (they launched together against the same context).
          const prevSnapshot = { ...contentAcc };

          const results = await Promise.allSettled(
            missing.map((k) => requestSection(k, prevSnapshot))
          );
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              failed.push(missing[i]);
              const reason = r.reason instanceof Error ? r.reason.message : '';
              if (reason && !failReason) failReason = reason;
            }
          });

          // Advance progress after each wave.
          const filled = PRD_SECTIONS.filter(
            (s) => (contentAcc[s.key] ?? '').trim().length > 0
          ).length;
          setPrdProgress(Math.round((filled / PRD_SECTIONS.length) * 100));
        }

        // No-progress guard: from round 2 on, if a full round didn't reduce the
        // missing count, retrying the same failing sections won't help — stop.
        if (round >= 2 && missingKeys().length >= missingBefore.length) break;
      }

      setPrdSection(null);

      // Completeness check: if the model hit its output-token cap or a section
      // timed out, the run finishes with sections missing. Don't claim success.
      const filledCount = PRD_SECTIONS.filter(
        (s) => (contentAcc[s.key] ?? '').trim().length > 0
      ).length;
      const missingCount = PRD_SECTIONS.length - filledCount;

      if (missingCount > 0) {
        toast.add({
          title: 'PRD belum lengkap',
          description: failed.length > 0
            ? `${missingCount} section gagal setelah ${MAX_ROUNDS} ronde otomatis${failReason ? ` — ${failReason}` : ''}. Klik Generate PRD lagi untuk coba sisanya.`
            : `${missingCount} section belum ter-generate (kemungkinan terpotong batas token model). Coba generate ulang atau gunakan model dengan output lebih besar.`,
          type: 'error',
        });
        // Persist partial content so the user doesn't lose what was generated.
        void persist('prd', undefined, contentAcc);
      } else {
        setPrdProgress(100);
        markComplete('prd');
        toast.add({ title: 'PRD selesai!', description: 'PRD berhasil dibuat.', type: 'success' });
        void persist('prd', undefined, contentAcc);
      }
    } catch (err) {
      toast.add({
        title: 'Generate PRD gagal',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        type: 'error',
      });
    } finally {
      setPrdStreaming(false);
      setThinking(false);
    }
  }

  // ── Persist to DB (create on first save, then PUT) ──
  async function persist(
    reason: PlanStep,
    structureOverride?: PlanStructure,
    contentOverride?: Partial<PRDContent>
  ) {
    const structureToSave = structureOverride ?? structure;
    // Prefer an explicit snapshot (the local accumulator from generatePRD,
    // which is always up to date); fall back to the freshest state mirror.
    const contentToSave = contentOverride ?? prdContentRef.current;
    try {
      if (!savedId) {
        const res = await fetch('/api/prd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            status: reason === 'prd' ? 'completed' : 'draft',
            content: contentToSave,
            idea,
            structure: structureToSave,
            model_used: activeModel,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const realId = json?.data?.id;
        if (realId) {
          setSavedId(realId);
          // Swap the URL to the persisted id WITHOUT a full navigation, so we
          // don't re-trigger the load effect and reset in-memory progress.
          window.history.replaceState(null, '', `/workspace/${realId}`);
        }
      } else {
        await fetch(`/api/prd/${savedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content: contentToSave,
            idea,
            structure: structureToSave,
            status: 'completed',
            model_used: activeModel,
          }),
        });
      }
    } catch {
      toast.add({ title: 'Gagal menyimpan', description: 'Perubahan tetap ada di layar.', type: 'error' });
    }
  }

  const prdSectionHandlers = useCallback(
    (key: PRDSectionKey) => (v: string) => setPrdContent((prev) => ({ ...prev, [key]: v })),
    []
  );

  // ── PRD object for export helpers ──
  const prdObj: PRD = {
    id: savedId ?? workspaceId,
    user_id: 'user-mock',
    title,
    description: null,
    status: 'completed',
    content: prdContent as PRDContent,
    markdown_content: null,
    model_used: activeModel,
    idea,
    structure,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  async function handleCopy() {
    const md = generateFullMarkdown(prdObj);
    const ok = await copyToClipboard(md);
    toast.add({
      title: ok ? 'Tersalin!' : 'Gagal menyalin',
      description: ok ? 'Markdown berhasil disalin ke clipboard.' : 'Tidak bisa menyalin.',
      type: ok ? 'success' : 'error',
    });
  }

  function handleDownload() {
    const md = generateFullMarkdown(prdObj);
    downloadMarkdown(md, `${title.replace(/\s+/g, '-').toLowerCase()}.md`);
    toast.add({ title: 'Download dimulai', description: 'File .md sedang didownload.', type: 'info' });
  }

  async function handleDownloadPDF() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
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

  // ── Chat refine (ask = jawab saja / edit = tulis ulang section) ──
  function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    if (chatMode === 'edit') {
      const sectionContent = prdContent[targetSection] ?? '';
      if (!sectionContent.trim()) {
        toast.add({
          title: 'Section masih kosong',
          description: 'Section target belum punya konten.',
          type: 'error',
        });
        return;
      }
      const userMsg = quote
        ? `Perhatikan bagian ini:\n> ${quote.text.slice(0, 300)}${quote.text.length > 300 ? '…' : ''}\n\n${text}`
        : text;
      setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
      persistChat('edit', 'user', userMsg);
      setChatInput('');
      setChatLoading(true);
      void refine('edit', targetSection, text, quote?.text, sectionContent);
      setQuote(null);
      return;
    }

    // Ask mode — no section required; give the whole PRD as context.
    const fullContext = PRD_SECTIONS.map((s) => {
      const body = (prdContent[s.key] ?? '').trim();
      return body ? `## ${s.title}\n${body}` : '';
    })
      .filter(Boolean)
      .join('\n\n');

    if (!fullContext) {
      toast.add({ title: 'PRD masih kosong', description: 'Generate PRD dulu.', type: 'error' });
      return;
    }
    const userMsg = quote
      ? `Perhatikan bagian ini:\n> ${quote.text.slice(0, 300)}${quote.text.length > 300 ? '…' : ''}\n\n${text}`
      : text;
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    persistChat('ask', 'user', userMsg);
    setChatInput('');
    setChatLoading(true);
    void refine('ask', targetSection, text, quote?.text, fullContext);
    setQuote(null);
  }

  async function refine(
    mode: 'ask' | 'edit',
    sectionKey: PRDSectionKey,
    instruction: string,
    selection: string | undefined,
    sectionContent: string
  ) {
    // Bind to the correct thread up-front so switching mode mid-stream can't
    // append tokens to the wrong conversation.
    const setThread = mode === 'ask' ? setAskMessages : setEditMessages;
    const controller = new AbortController();
    const engineBody = await fetchEngineBody(activeModel);
    try {
      const res = await fetch('/api/prd/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: activeModel,
          section_key: sectionKey,
          content: sectionContent,
          instruction,
          selection,
          mode,
          ...(engineBody ?? {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (mode === 'ask') {
        // Stream the answer into a live assistant chat bubble; never touch the PRD.
        let answer = '';
        setThread((prev) => [...prev, { role: 'assistant', content: '' }]);
        for await (const raw of parseSSEStream(res)) {
          const ev = raw as unknown as RefineStreamEvent;
          if (ev.type === 'token') {
            answer += ev.content;
            const clean = stripThink(answer);
            setThread((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', content: clean };
              return next;
            });
          } else if (ev.type === 'done') {
            break;
          } else if (ev.type === 'error') {
            throw new Error(ev.message);
          }
        }
        persistChat('ask', 'assistant', stripThink(answer));
        return;
      }

      // Edit mode: rewrite the section content in the editor.
      let refined = '';
      for await (const raw of parseSSEStream(res)) {
        const ev = raw as unknown as RefineStreamEvent;
        if (ev.type === 'token') {
          refined += ev.content;
          setPrdContent((prev) => ({ ...prev, [sectionKey]: stripThink(refined) }));
        } else if (ev.type === 'done') {
          break;
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }

      const doneMsg = `Section "${PRD_SECTIONS.find((s) => s.key === sectionKey)?.title}" sudah diupdate. Periksa hasilnya di editor.`;
      setThread((prev) => [...prev, { role: 'assistant', content: doneMsg }]);
      persistChat('edit', 'assistant', doneMsg);
      void persist('prd');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setThread((prev) => [...prev, { role: 'assistant', content: `Gagal: ${message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  const isBusy = structureLoading || prdStreaming;

  // Which step can be navigated to.
  function handleStepClick(step: PlanStep) {
    if (isBusy) return;
    if (step === activeStep) return;
    if (completedSteps.includes(step) || step === activeStep) setActiveStep(step);
    else if (step === 'prd' && completedSteps.includes('structure')) setActiveStep('prd');
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-paper bg-paper px-4 py-2.5">
        <Button variant="ghost" size="icon-sm" render={<Link href="/dashboard" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="max-w-[220px] truncate text-sm font-semibold text-ink">{title}</span>

        <div className="mx-auto">
          <StepperHeader activeStep={activeStep} completedSteps={completedSteps} onStepClick={handleStepClick} />
        </div>

        <span className="stamp hidden text-[9px] lg:inline-flex">{displayModelName}</span>

        {/* Export + chat toggle — only meaningful once a PRD exists */}
        {(activeStep === 'prd' || completedSteps.includes('prd')) && (
          <>
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
                <DropdownMenuItem onClick={handleDownloadPDF} disabled={pdfBusy || isBusy}>
                  <Printer className="size-3.5" />
                  {pdfBusy ? 'Membuat PDF...' : 'Download PDF'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setChatOpen((v) => !v)}
              title="Chat Refine"
            >
              <MessageSquare className="size-4" />
            </Button>
          </>
        )}

        <StepAction
          activeStep={activeStep}
          completedSteps={completedSteps}
          isBusy={isBusy}
          hasStructure={Boolean(structure)}
          onGeneratePRD={generatePRD}
        />
      </div>

      {/* Phase body */}
      <div className="flex-1 overflow-hidden">
        {activeStep === 'structure' && (
          <div className="h-full">
            {structure ? (
              <MindmapCanvas structure={structure} streaming={structureLoading} />
            ) : (
              // Skeleton mindmap while the structure streams in — mirrors the
              // final layout (root → features → sub-features) with pulsing
              // placeholders so the user sees the map being built.
              <MindmapCanvas structure={SKELETON_STRUCTURE} streaming />
            )}
          </div>
        )}

        {activeStep === 'prd' && (
          <div className="flex h-full overflow-hidden">
            {/* Editor */}
            <div className="relative flex-1 overflow-y-auto bg-paper-raised p-4 sm:p-8" ref={editorScrollRef}>
              <div className="mx-auto max-w-3xl space-y-6">
                {Object.keys(prdContent).length === 0 && !prdStreaming ? (
                  <div className="perf-ticket rounded-md p-10 text-center">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Belum ada PRD</p>
                    <h3 className="mt-2 text-lg font-bold text-ink">Generate PRD dari struktur</h3>
                    <p className="mt-1 text-sm text-ink-dim">
                      PRD akan dibuat berdasarkan struktur fitur yang sudah kamu review.
                    </p>
                    <Button className="mt-4 gap-2" onClick={generatePRD} disabled={!structure || isBusy}>
                      <Sparkles className="size-4" /> Generate PRD
                    </Button>
                  </div>
                ) : (
                  PRD_SECTIONS.map((section) => (
                    <SectionCard
                      key={section.key}
                      title={section.title}
                      sectionKey={section.key}
                      content={prdContent[section.key] ?? ''}
                      isStreaming={prdSection === section.key}
                      onContentChange={prdSectionHandlers(section.key)}
                    />
                  ))
                )}
              </div>

              {/* Floating "Tanya AI" popup on text selection */}
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

            {/* Chat Refine panel */}
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
                {/* Ask / Edit mode toggle */}
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setChatMode('ask')}
                    className={cn(
                      'rounded-[6px] py-1.5 text-xs font-medium transition-colors',
                      chatMode === 'ask'
                        ? 'bg-paper-raised text-ink shadow-sm'
                        : 'text-ink-dim hover:text-ink'
                    )}
                  >
                    Tanya
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatMode('edit')}
                    className={cn(
                      'rounded-[6px] py-1.5 text-xs font-medium transition-colors',
                      chatMode === 'edit'
                        ? 'bg-paper-raised text-primary shadow-sm'
                        : 'text-ink-dim hover:text-ink'
                    )}
                  >
                    Edit PRD
                  </button>
                </div>
                {/* Section target only matters in Edit mode. */}
                {chatMode === 'edit' && (
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
                )}
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                  {chatMode === 'ask'
                    ? 'Mode Tanya — jawaban tampil di chat, PRD tidak berubah.'
                    : 'Mode Edit — section terpilih akan ditulis ulang.'}
                </p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-paper-raised/50 p-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'max-w-[90%] rounded-xl px-3 py-2 text-sm',
                      msg.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted text-ink'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="markdown-body text-sm">
                        <SharedMarkdown content={msg.content} />
                      </div>
                    ) : (
                      msg.content
                    )}
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
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                    placeholder={
                      quote
                        ? 'Instruksi untuk kutipan ini...'
                        : chatMode === 'ask'
                          ? 'Tanya apa saja soal section ini...'
                          : 'Ketik instruksi edit...'
                    }
                    className="flex-1 border-border-paper bg-paper-raised focus-visible:ring-primary"
                    disabled={chatLoading || isBusy}
                  />
                  <Button
                    size="icon"
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatLoading || isBusy}
                  >
                    {chatLoading ? (
                      <MessageSquare className="size-3.5 animate-pulse" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Contextual primary action in the top bar per phase. */
function StepAction({
  activeStep,
  completedSteps,
  isBusy,
  hasStructure,
  onGeneratePRD,
}: {
  activeStep: PlanStep;
  completedSteps: PlanStep[];
  isBusy: boolean;
  hasStructure: boolean;
  onGeneratePRD: () => void;
}) {
  if (activeStep === 'structure') {
    return (
      <Button
        size="sm"
        className="gap-1.5"
        onClick={onGeneratePRD}
        disabled={!hasStructure || isBusy}
      >
        {completedSteps.includes('prd') ? 'Lanjut ke PRD' : 'Lanjutkan'}
        <ArrowRight className="size-3.5" />
      </Button>
    );
  }
  return null;
}
