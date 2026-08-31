# Parallel PRD Generation (Waves) — Design

Date: 2026-09-01 · Status: Approved

## Problem
17 PRD sections generated sequentially → total time ≈ 17× per-section latency. With slow models (~1-3 min/section) a full run takes 30+ minutes.

## Solution
Client-side parallel waves in `generatePRD` (workspace page). Server untouched — `/api/prd/generate` already accepts `sections` + `previous`.

### Waves
1. executive_summary, problem_statement, goals_metrics, user_personas, glossary
2. feature_list, user_stories, functional_requirements, non_functional_requirements
3. system_architecture, data_model, api_specification, risk_assessment
4. open_questions, diagrams, roadmap, task_breakdown

### Per wave
- All sections fetched CONCURRENTLY (1 request each, `sections: [key]`, own AbortController, 290s timeout)
- `previous` = snapshot of all filled sections from earlier waves → cross-wave ID/terminology consistency
- `Promise.allSettled` → failures recorded, wave continues; later waves unaffected

### Retry (unchanged semantics)
MAX_ROUNDS=3 outer loop; round N+1 re-requests only still-missing sections (parallel again); no-progress guard stops a round that filled nothing new.

### Risks accepted
- Provider rate limits (4-5 concurrent streams): failed sections auto-retry next round.
- Parallel token appends are independent per section key — no shared-buffer race.
- Progress bar jumps as sections fill concurrently (cosmetic).

## Files
- `src/app/(dashboard)/workspace/[id]/page.tsx` — generatePRD only (PRD_BATCHES reinterpreted as waves)
