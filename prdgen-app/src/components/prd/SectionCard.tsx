'use client';

import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Pencil, RefreshCw, Minus, Plus, Maximize2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type { PRDSectionKey } from '@/types';

let mermaidInit = false;
let diagramSeq = 0;

const MERMAID_SCALE_MIN = 0.4;
const MERMAID_SCALE_MAX = 3;

const MermaidDiagram = memo(function MermaidDiagram({ code, defer }: { code: string; defer?: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Bumped whenever the light/dark class on <html> changes, to re-render the
  // diagram with the matching mermaid theme.
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  // Pan/zoom transform state for the inner (rendered SVG) wrapper.
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Refs mirror latest values so zoomBy computes the cursor-anchored translate
  // purely and sets each state once (nested setState double-applies under
  // StrictMode → desynced zoom origin).
  const scaleRef = useRef(scale);
  const translateRef = useRef(translate);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);
  const dragState = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // Skip render attempts while the section is still streaming — the mermaid
    // block is incomplete and mermaid.render() would throw parse errors.
    if (defer) return;
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setFailed(false);

    (async () => {
      const id = `mermaid-diagram-${++diagramSeq}`;
      try {
        const mermaid = (await import('mermaid')).default;
        // Re-initialize each render so the theme follows light/dark mode.
        const isDark = document.documentElement.classList.contains('dark');
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'neutral',
          darkMode: isDark,
        });
        mermaidInit = true;
        // Validate FIRST. mermaid.render() on invalid syntax injects an error
        // "bomb" SVG into <body> and leaves orphan nodes; parse() with
        // suppressErrors returns false instead of throwing/polluting the DOM.
        const ok = await mermaid.parse(code, { suppressErrors: true });
        if (!ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) container.innerHTML = svg;
        else document.getElementById(id)?.remove();
      } catch {
        // Clean up any orphan node mermaid may have appended before throwing.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, defer, themeVersion]);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((factor: number, origin?: { x: number; y: number }) => {
    const prev = scaleRef.current;
    const next = Math.max(MERMAID_SCALE_MIN, Math.min(MERMAID_SCALE_MAX, prev * factor));
    if (next === prev) return;
    if (origin) {
      // Keep the point under the cursor stable while zooming.
      const t = translateRef.current;
      setTranslate({
        x: origin.x - (origin.x - t.x) * (next / prev),
        y: origin.y - (origin.y - t.y) * (next / prev),
      });
    }
    setScale(next);
  }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    // Zoom toward the cursor. Native non-passive listener (attached below) so
    // preventDefault stops the page from scrolling and the origin stays synced.
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    const origin = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : undefined;
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomBy(factor, origin);
  }, [zoomBy]);

  // Attach wheel as non-passive so preventDefault works (React onWheel is passive).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || defer) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel, defer, failed]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't start a pan when pressing one of the control buttons.
    if ((e.target as HTMLElement).closest('[data-mermaid-control]')) return;
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: translate.x,
      origY: translate.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [translate.x, translate.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    setTranslate({
      x: dragState.current.origX + (e.clientX - dragState.current.startX),
      y: dragState.current.origY + (e.clientY - dragState.current.startY),
    });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  }, []);

  // Streaming: keep showing the raw code, non-interactive.
  if (defer) {
    return <pre className="font-mono text-xs text-ink-dim">{code}</pre>;
  }

  return (
    <div
      ref={viewportRef}
      className={cn(
        'relative my-2 h-[420px] select-none overflow-hidden rounded-md border border-border-paper/25 bg-paper-raised p-0.5',
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="application"
      aria-label="Diagram interaktif — geser untuk memindahkan, scroll untuk zoom"
    >
      {failed ? (
        <pre className="font-mono text-xs text-ink-dim">{code}</pre>
      ) : (
        <div
          ref={containerRef}
          className="origin-top-left [&_svg]:h-auto [&_svg]:max-w-none"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 0.12s ease-out',
          }}
        />
      )}

      {!failed && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border-paper bg-paper-raised/90 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            data-mermaid-control
            onClick={() => zoomBy(0.9)}
            aria-label="Perkecil"
            title="Perkecil"
            className="flex size-6 items-center justify-center rounded text-ink-dim transition-colors hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            data-mermaid-control
            onClick={() => zoomBy(1.1)}
            aria-label="Perbesar"
            title="Perbesar"
            className="flex size-6 items-center justify-center rounded text-ink-dim transition-colors hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Plus className="size-3.5" />
          </button>
          <span className="mx-0.5 h-4 w-px bg-border-paper" />
          <button
            type="button"
            data-mermaid-control
            onClick={reset}
            aria-label="Atur ulang tampilan"
            title="Atur ulang tampilan"
            className="flex size-6 items-center justify-center rounded text-ink-dim transition-colors hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});

interface SectionCardProps {
  title: string;
  sectionKey: PRDSectionKey;
  content: string;
  isStreaming?: boolean;
  onContentChange?: (content: string) => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export const SectionCard = memo(function SectionCard({ title, sectionKey, content, isStreaming, onContentChange, onRegenerate, isRegenerating }: SectionCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasDiagram = useMemo(
    () => sectionKey === 'diagrams' || /```mermaid/.test(content),
    [sectionKey, content]
  );

  // Memoize the markdown tree so only the streaming section re-parses per token.
  const markdown = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            if (/language-mermaid/.test(className ?? '')) {
              return <MermaidDiagram code={String(children).replace(/\n$/, '')} defer={isStreaming} />;
            }
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    ),
    [content, isStreaming]
  );

  function startEditing() {
    if (isStreaming) return;
    setDraft(content);
    setEditing(true);
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  function save() {
    setEditing(false);
    onContentChange?.(draft);
  }

  return (
    <div
      data-section-key={sectionKey}
      className={cn(
        'perf-ticket group relative rounded-md border border-paper-raised/60 bg-paper-raised p-5 pl-7 transition-all',
        isStreaming
          ? 'border-primary/40 bg-primary-soft/50 shadow-sm animate-pulse'
          : 'hover:shadow-md'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {hasDiagram && !isStreaming && content && (
            <span className="perf-ticket rounded-sm border border-paper-raised/60 bg-paper px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-ink-dim">
              DIAGRAM
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!editing && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isStreaming || isRegenerating || !content}
              title="Regenerate section ini"
              className="flex items-center gap-1 rounded-md border border-border-paper bg-paper px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={cn('size-3', isRegenerating && 'animate-spin')} />
              {isRegenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          )}
          {!editing && !isStreaming && !isRegenerating && content && (
            <button
              type="button"
              onClick={startEditing}
              className="flex items-center gap-1 rounded-md border border-border-paper bg-paper px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
            >
              <Pencil className="size-3" />
              Edit
            </button>
          )}
          {editing && (
            <span className="font-mono text-[11px] text-primary">Editing…</span>
          )}
        </div>
      </div>

      {isRegenerating && (
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-primary">
          <RefreshCw className="size-3 animate-spin" />
          Menulis ulang section ini...
        </div>
      )}
      {editing ? (
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          className="min-h-[200px] border-border-paper bg-paper font-mono text-sm focus-visible:ring-primary"
        />
      ) : (
        <div className="markdown-body max-w-none text-ink">
          {content ? (
            markdown
          ) : (
            <p className="italic text-ink-faint">Klik Edit di kanan atas untuk mengisi...</p>
          )}
        </div>
      )}
    </div>
  );
});
