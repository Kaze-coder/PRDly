'use client';

import { Check } from 'lucide-react';
import { PLAN_STEPS, type PlanStep } from '@/types';
import { cn } from '@/lib/utils';

interface StepperHeaderProps {
  activeStep: PlanStep;
  /** Steps that are done — render with a check mark. */
  completedSteps: PlanStep[];
  /** Clicking a completed or active step navigates. Locked steps are inert. */
  onStepClick?: (step: PlanStep) => void;
}

export function StepperHeader({ activeStep, completedSteps, onStepClick }: StepperHeaderProps) {
  const activeIndex = PLAN_STEPS.findIndex((s) => s.key === activeStep);
  const completedSet = new Set(completedSteps);

  // The connector before step i is "filled" once every step up to i is done.
  const isConnectorFilled = (rightIndex: number) => {
    const left = PLAN_STEPS[rightIndex - 1];
    return completedSet.has(left.key);
  };

  return (
    <nav aria-label="Tahapan perencanaan" className="w-full">
      <ol className="flex items-center gap-1 sm:gap-2">
        {PLAN_STEPS.map((step, i) => {
          const isCompleted = completedSet.has(step.key);
          const isActive = step.key === activeStep;
          const isClickable = (isCompleted || isActive) && Boolean(onStepClick);
          const isFuture = !isCompleted && i > activeIndex;

          return (
            <li key={step.key} className="flex items-center gap-1 sm:gap-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'h-px w-6 shrink-0 transition-colors sm:w-10',
                    isConnectorFilled(i) ? 'bg-primary' : 'bg-border-paper'
                  )}
                />
              )}

              <button
                type="button"
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                onClick={isClickable ? () => onStepClick?.(step.key) : undefined}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors',
                  isClickable ? 'cursor-pointer hover:bg-primary/5' : 'cursor-default',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-all',
                    isCompleted &&
                      'border-primary bg-primary text-primary-foreground',
                    !isCompleted &&
                      isActive &&
                      'border-primary bg-primary/10 text-primary ring-2 ring-primary/30',
                    !isCompleted &&
                      !isActive &&
                      'border-border-paper bg-transparent text-ink-faint'
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : isActive ? (
                    <span className="size-2 rounded-full bg-primary" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current opacity-60" />
                  )}
                </span>

                <span
                  className={cn(
                    'font-mono text-xs uppercase tracking-wider transition-colors',
                    isActive && 'font-semibold text-ink',
                    isCompleted && !isActive && 'text-ink-dim',
                    isFuture && 'text-ink-faint'
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
