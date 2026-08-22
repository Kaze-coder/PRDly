'use client';

import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { PlanFeature } from '@/types';
import { cn } from '@/lib/utils';

interface TaskBoardProps {
  features: PlanFeature[];
  onToggleTask: (featureId: string, taskId: string) => void;
  streaming?: boolean;
}

export function TaskBoard({ features, onToggleTask, streaming = false }: TaskBoardProps) {
  return (
    <div className="space-y-5">
      {streaming && (
        <div className="flex items-center gap-2 font-mono text-xs text-primary">
          <Loader2 className="size-3.5 animate-spin" />
          <span className="animate-pulse">Menghasilkan task…</span>
        </div>
      )}

      {features.map((feature) => (
        <FeatureSection key={feature.id} feature={feature} onToggleTask={onToggleTask} />
      ))}

      {!features.length && !streaming && (
        <p className="italic text-ink-faint">Belum ada task untuk ditampilkan.</p>
      )}
    </div>
  );
}

function FeatureSection({
  feature,
  onToggleTask,
}: {
  feature: PlanFeature;
  onToggleTask: (featureId: string, taskId: string) => void;
}) {
  const total = feature.tasks.length;
  const done = feature.tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className="perf-ticket rounded-md p-5 pl-7">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="font-heading text-base font-semibold text-ink">{feature.name}</h3>
          <span className="stamp text-stamp">Fase {feature.phase}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-ink-dim">
            {done}/{total}
          </span>
          <div
            className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progres ${feature.name}`}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      {total ? (
        <ul className="space-y-1">
          {feature.tasks.map((task) => {
            const labelId = `task-${task.id}-label`;
            return (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-paper"
              >
                <Checkbox
                  checked={task.done}
                  onCheckedChange={() => onToggleTask(feature.id, task.id)}
                  aria-labelledby={labelId}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <label
                    id={labelId}
                    className={cn(
                      'block cursor-pointer text-sm font-medium leading-snug',
                      task.done ? 'text-ink-faint line-through' : 'text-ink'
                    )}
                    onClick={() => onToggleTask(feature.id, task.id)}
                  >
                    {task.title}
                  </label>
                  {task.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">
                      {task.description}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs italic text-ink-faint">Belum ada task pada fitur ini.</p>
      )}
    </section>
  );
}
