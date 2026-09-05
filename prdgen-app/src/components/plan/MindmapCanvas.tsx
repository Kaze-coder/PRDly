'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import type { PlanStructure, PlanFeature } from '@/types';
import { cn } from '@/lib/utils';

interface MindmapCanvasProps {
  structure: PlanStructure;
  /** When true, also render a TASKS column with per-feature task counts. */
  showTasks?: boolean;
  /** When true, render a subtle pulsing/skeleton state where data is sparse. */
  streaming?: boolean;
  onFeatureClick?: (featureId: string) => void;
  className?: string;
}

// ── Layout constants (canvas coordinate space, pre-transform) ──
const COL_W = 260; // card width per column
const COL_GAP = 96; // horizontal gap between columns
const PAD_X = 56; // outer horizontal padding inside the content layer
const PAD_TOP = 40; // top breathing room
const PAD_BOTTOM = 28; // tight bottom padding — no dead canvas below the last card
const SLOT_GAP = 40; // vertical gap between feature slots
const ROOT_H = 150; // root node reference height (grows via minHeight)

const SCALE_MIN = 0.4;
const SCALE_MAX = 2;

interface Point {
  x: number;
  y: number;
}

interface FeatureLayout {
  feature: PlanFeature;
  // left/top of each column card + its vertical center
  featureBox: { x: number; y: number; h: number };
  subBox: { x: number; y: number; h: number };
  taskBox: { x: number; y: number; h: number };
  centerY: number;
}

interface Layout {
  width: number;
  height: number;
  rootBox: { x: number; y: number; h: number };
  features: FeatureLayout[];
}

function computeLayout(structure: PlanStructure, showTasks: boolean, streaming: boolean): Layout {
  const cols = showTasks ? 4 : 3;
  const colX = (index: number) => PAD_X + index * (COL_W + COL_GAP);

  // Each feature owns a vertical slot sized by its richest (tallest) column.
  let cursorY = PAD_TOP;
  const features: FeatureLayout[] = structure.features.map((feature) => {
    const featureH = featureCardH(feature, streaming);
    const subH = subCardH(feature, streaming);
    const taskH = showTasks ? taskCardH(feature, streaming) : 0;
    const slotH = Math.max(featureH, subH, taskH);
    const top = cursorY;
    const centerY = top + slotH / 2;

    const layout: FeatureLayout = {
      feature,
      featureBox: { x: colX(1), y: centerY - featureH / 2, h: featureH },
      subBox: { x: colX(2), y: centerY - subH / 2, h: subH },
      taskBox: { x: colX(3), y: centerY - taskH / 2, h: taskH },
      centerY,
    };
    cursorY = top + slotH + SLOT_GAP;
    return layout;
  });

  // Bottom of the content is the last slot's end (minus the trailing gap) plus a
  // tight bottom pad — no reserved dead space below the final card.
  const contentBottom = features.length
    ? cursorY - SLOT_GAP + PAD_BOTTOM
    : PAD_TOP + ROOT_H + PAD_BOTTOM;

  // Root sits vertically centered against the whole feature stack.
  const stackCenter = features.length
    ? (features[0].centerY + features[features.length - 1].centerY) / 2
    : PAD_TOP + ROOT_H / 2;

  return {
    width: colX(cols - 1) + COL_W + PAD_X,
    height: Math.max(contentBottom, stackCenter + ROOT_H / 2 + PAD_BOTTOM),
    rootBox: { x: PAD_X, y: stackCenter - ROOT_H / 2, h: ROOT_H },
    features,
  };
}

// ── Content-driven height estimates (canvas coordinate space) ──
// Cards render with `minHeight: box.h`, so these estimates drive both the slot
// sizing and the connector anchor math. They mirror the actual DOM padding/type
// so a names-only feature (no description) gets a compact box instead of the old
// fixed name+description height.
const CARD_PAD_Y = 28; // p-3.5 → 14px top + 14px bottom
const NAME_LINE_H = 18; // h4 text-sm leading-tight, per line
const HEADER_MB = 6; // mb-1.5 under the name/badge header row
const DESC_LINE_H = 20; // text-xs leading-relaxed, per line
const LABEL_H = 22; // section label (text-[10px]) + mb-2
const LIST_GAP = 6; // space-y-1.5 between list rows
const SUB_ROW_H = 18; // one sub-feature name line
const SUB_DESC_H = 15; // extra line when a sub-feature has a description
const TASK_ROW_H = 17; // one task preview row
const OVERFLOW_H = 16; // "+N task lainnya" line
const EMPTY_LINE_H = 16; // single italic empty-state line

function estimateLines(text: string | undefined, perLine: number): number {
  if (!text) return 1;
  return Math.min(3, Math.max(1, Math.ceil(text.length / perLine)));
}

function featureCardH(feature: PlanFeature, streaming: boolean): number {
  // Streaming with no name yet → the sparse skeleton shows a name bar + 2 desc bars.
  if (streaming && !feature.name) {
    return CARD_PAD_Y + NAME_LINE_H + HEADER_MB + 2 * DESC_LINE_H;
  }
  let h = CARD_PAD_Y + estimateLines(feature.name, 24) * NAME_LINE_H + HEADER_MB;
  if (feature.description) {
    h += estimateLines(feature.description, 38) * DESC_LINE_H;
  }
  return h;
}

function subCardH(feature: PlanFeature, streaming: boolean): number {
  const base = CARD_PAD_Y + LABEL_H;
  if (streaming && feature.subFeatures.length === 0) {
    return base + 3 * SUB_ROW_H + 2 * LIST_GAP;
  }
  const n = feature.subFeatures.length;
  if (n === 0) return base + EMPTY_LINE_H;
  let h = base + n * SUB_ROW_H + (n - 1) * LIST_GAP;
  for (const sub of feature.subFeatures) {
    if (sub.description) h += SUB_DESC_H;
  }
  return h;
}

function taskCardH(feature: PlanFeature, streaming: boolean): number {
  const base = CARD_PAD_Y + LABEL_H;
  if (streaming && feature.tasks.length === 0) {
    return base + 3 * TASK_ROW_H + 2 * LIST_GAP;
  }
  const preview = Math.min(feature.tasks.length, 3);
  if (preview === 0) return base + EMPTY_LINE_H;
  let h = base + preview * TASK_ROW_H + (preview - 1) * LIST_GAP;
  if (feature.tasks.length > 3) h += OVERFLOW_H + LIST_GAP;
  return h;
}

// Horizontal S-curve between two points (right edge of a → left edge of b).
function bezier(a: Point, b: Point): string {
  const dx = Math.max(Math.abs(b.x - a.x) * 0.5, 48);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export function MindmapCanvas({
  structure,
  showTasks = false,
  streaming = false,
  onFeatureClick,
  className,
}: MindmapCanvasProps) {
  const layout = useMemo(() => computeLayout(structure, showTasks, streaming), [structure, showTasks, streaming]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });

  // Refs mirror the latest scale/translate so zoomBy can compute both new
  // values purely and set each once (nesting setTranslate inside setScale's
  // updater double-applies under StrictMode → desynced zoom origin).
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

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const next = Math.min(cw / layout.width, ch / layout.height, 1);
    const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, next));
    const scaledH = layout.height * clamped;
    // When the (now content-tight) canvas is shorter than the viewport, pin it
    // near the top with a small intentional offset instead of centering — that
    // avoids big empty bands above and below a short structure. Taller-than-view
    // content still centers so the overflow is balanced.
    const TOP_OFFSET = 32;
    const y = scaledH < ch ? Math.min((ch - scaledH) / 2, TOP_OFFSET) : (ch - scaledH) / 2;
    setScale(clamped);
    setTranslate({
      x: (cw - layout.width * clamped) / 2,
      y,
    });
  }, [layout.width, layout.height]);

  // Fit once on mount and whenever the structure shape changes.
  useLayoutEffect(() => {
    fit();
  }, [fit]);

  const zoomBy = useCallback((factor: number, origin?: Point) => {
    const prev = scaleRef.current;
    const next = Math.max(SCALE_MIN, Math.min(SCALE_MAX, prev * factor));
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

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Allow panning from anywhere on the canvas — including over feature cards.
    // Only skip when the press starts on an actually-interactive element
    // (a clickable feature button or a zoom control), so those still work.
    if ((e.target as HTMLElement).closest('button, a, [data-control]')) return;
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: translate.x,
      origY: translate.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    // Plain wheel zooms toward the cursor. Native listener (see effect below)
    // so preventDefault actually works — React's onWheel is passive in React 19,
    // which would let the page scroll and desync the zoom origin.
    e.preventDefault();
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const origin = rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : undefined;
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomBy(factor, origin);
  }, [zoomBy]);

  // Attach the wheel listener as non-passive so preventDefault stops page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full w-full overflow-hidden rounded-lg select-none',
        'bg-[#141412] text-[#EDEAE2]',
        className
      )}
      style={{
        backgroundImage:
          'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        cursor: dragState.current.active ? 'grabbing' : 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="application"
      aria-label="Mindmap struktur perencanaan"
    >
      {/* Transform layer */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: dragState.current.active ? 'none' : 'transform 0.12s ease-out',
        }}
      >
        {/* Connectors behind cards */}
        <svg
          className="pointer-events-none absolute left-0 top-0 z-0"
          width={layout.width}
          height={layout.height}
          fill="none"
        >
          {layout.features.map((f) => {
            const rootPt: Point = {
              x: layout.rootBox.x + COL_W,
              y: layout.rootBox.y + layout.rootBox.h / 2,
            };
            const featIn: Point = { x: f.featureBox.x, y: f.centerY };
            const featOut: Point = { x: f.featureBox.x + COL_W, y: f.centerY };
            const subIn: Point = { x: f.subBox.x, y: f.centerY };
            const subOut: Point = { x: f.subBox.x + COL_W, y: f.centerY };
            const taskIn: Point = { x: f.taskBox.x, y: f.centerY };
            return (
              <g key={f.feature.id} stroke="#4A9E7A" strokeWidth={1.5} strokeOpacity={0.5}>
                <path d={bezier(rootPt, featIn)} />
                <path d={bezier(featOut, subIn)} />
                {showTasks && <path d={bezier(subOut, taskIn)} />}
              </g>
            );
          })}
        </svg>

        {/* Root node */}
        <RootCard
          box={layout.rootBox}
          title={structure.root.title}
          overview={structure.root.overview}
          streaming={streaming}
        />

        {/* Feature / sub / task cards */}
        {layout.features.map((f) => (
          <div key={f.feature.id}>
            <FeatureCard
              box={f.featureBox}
              feature={f.feature}
              streaming={streaming}
              onClick={onFeatureClick ? () => onFeatureClick(f.feature.id) : undefined}
            />
            <SubFeatureCard box={f.subBox} feature={f.feature} streaming={streaming} />
            {showTasks && <TaskPreviewCard box={f.taskBox} feature={f.feature} streaming={streaming} />}
          </div>
        ))}
      </div>

      {/* Zoom controls — bottom-left */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] p-1 backdrop-blur">
        <ControlButton label="Perkecil" onClick={() => zoomBy(0.9)}>
          <Minus className="size-4" />
        </ControlButton>
        <span className="min-w-11 text-center font-mono text-[11px] tabular-nums text-white/70">
          {Math.round(scale * 100)}%
        </span>
        <ControlButton label="Perbesar" onClick={() => zoomBy(1.1)}>
          <Plus className="size-4" />
        </ControlButton>
        <span className="mx-0.5 h-4 w-px bg-white/10" />
        <ControlButton label="Sesuaikan tampilan" onClick={fit}>
          <Maximize2 className="size-4" />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-7 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A9E7A]/60"
    >
      {children}
    </button>
  );
}

// ── Node cards (dark surface) ──

const cardBase =
  'absolute z-10 rounded-lg border border-white/10 bg-white/[0.03] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm';

function RootCard({
  box,
  title,
  overview,
  streaming,
}: {
  box: { x: number; y: number; h: number };
  title: string;
  overview: string;
  streaming?: boolean;
}) {
  const sparse = streaming && !title;
  return (
    <div
      data-node
      className={cn(cardBase, 'flex flex-col p-4')}
      style={{ left: box.x, top: box.y, width: COL_W, minHeight: box.h }}
    >
      <span className="mb-2 inline-flex w-fit items-center rounded-sm bg-[#4A9E7A]/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7FD1AE]">
        Perencanaan
      </span>
      {sparse ? (
        <div className="space-y-2">
          <span className="block h-3.5 w-3/4 animate-pulse rounded bg-white/15" />
          <span className="block h-2.5 w-full animate-pulse rounded bg-white/10" />
          <span className="block h-2.5 w-2/3 animate-pulse rounded bg-white/10" />
        </div>
      ) : (
        <>
          <h3 className="font-heading text-base font-semibold leading-tight text-white">
            {title || 'Tanpa judul'}
          </h3>
          {overview && (
            <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-white/55">
              {overview}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FeatureCard({
  box,
  feature,
  streaming,
  onClick,
}: {
  box: { x: number; y: number; h: number };
  feature: PlanFeature;
  streaming: boolean;
  onClick?: () => void;
}) {
  const sparse = streaming && !feature.name;
  const interactive = Boolean(onClick);

  const inner = (
    <>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        {sparse ? (
          <span className="h-3.5 w-28 animate-pulse rounded bg-white/15" />
        ) : (
          <h4 className="font-heading text-sm font-semibold leading-tight text-white">
            {feature.name}
          </h4>
        )}
        <span className="shrink-0 rounded-sm border border-[#4A9E7A]/40 bg-[#4A9E7A]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#7FD1AE]">
          Fase {feature.phase}
        </span>
      </div>
      {sparse ? (
        <div className="space-y-1.5">
          <span className="block h-2.5 w-full animate-pulse rounded bg-white/10" />
          <span className="block h-2.5 w-2/3 animate-pulse rounded bg-white/10" />
        </div>
      ) : feature.description ? (
        <p className="line-clamp-3 text-xs leading-relaxed text-white/55">
          {feature.description}
        </p>
      ) : null}
    </>
  );

  const style = { left: box.x, top: box.y, width: COL_W, minHeight: box.h } as const;

  if (interactive) {
    return (
      <button
        type="button"
        data-node
        onClick={onClick}
        className={cn(
          cardBase,
          'flex flex-col p-3.5 text-left transition-colors hover:border-[#4A9E7A]/50 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A9E7A]/60'
        )}
        style={style}
      >
        {inner}
      </button>
    );
  }

  return (
    <div data-node className={cn(cardBase, 'flex flex-col p-3.5')} style={style}>
      {inner}
    </div>
  );
}

function SubFeatureCard({
  box,
  feature,
  streaming,
}: {
  box: { x: number; y: number; h: number };
  feature: PlanFeature;
  streaming: boolean;
}) {
  const sparse = streaming && feature.subFeatures.length === 0;

  return (
    <div
      data-node
      className={cn(cardBase, 'flex flex-col p-3.5')}
      style={{ left: box.x, top: box.y, width: COL_W, minHeight: box.h }}
    >
      <span className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
        Sub Fitur
      </span>
      {sparse ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-3 w-full animate-pulse rounded bg-white/10" />
          ))}
        </div>
      ) : feature.subFeatures.length ? (
        <ul className="space-y-1.5">
          {feature.subFeatures.map((sub) => (
            <li key={sub.id} className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#4A9E7A]" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white/85">{sub.name}</p>
                {sub.description && (
                  <p className="line-clamp-1 text-[11px] leading-snug text-white/45">
                    {sub.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] italic text-white/35">Belum ada sub fitur.</p>
      )}
    </div>
  );
}

function TaskPreviewCard({
  box,
  feature,
  streaming,
}: {
  box: { x: number; y: number; h: number };
  feature: PlanFeature;
  streaming: boolean;
}) {
  const done = feature.tasks.filter((t) => t.done).length;
  const total = feature.tasks.length;
  const sparse = streaming && total === 0;
  const preview = feature.tasks.slice(0, 3);

  return (
    <div
      data-node
      className={cn(cardBase, 'flex flex-col p-3.5')}
      style={{ left: box.x, top: box.y, width: COL_W, minHeight: box.h }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
          Tasks
        </span>
        <span className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#7FD1AE]">
          {done}/{total}
        </span>
      </div>
      {sparse ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-3 w-full animate-pulse rounded bg-white/10" />
          ))}
        </div>
      ) : preview.length ? (
        <ul className="space-y-1.5">
          {preview.map((task) => (
            <li key={task.id} className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[8px]',
                  task.done
                    ? 'border-[#4A9E7A] bg-[#4A9E7A] text-[#141412]'
                    : 'border-white/25'
                )}
              >
                {task.done ? '✓' : ''}
              </span>
              <span
                className={cn(
                  'line-clamp-1 text-[11px] leading-snug',
                  task.done ? 'text-white/40 line-through' : 'text-white/80'
                )}
              >
                {task.title}
              </span>
            </li>
          ))}
          {total > 3 && (
            <li className="pl-5 font-mono text-[10px] text-white/35">
              +{total - 3} task lainnya
            </li>
          )}
        </ul>
      ) : (
        <p className="text-[11px] italic text-white/35">Belum ada task.</p>
      )}
    </div>
  );
}
