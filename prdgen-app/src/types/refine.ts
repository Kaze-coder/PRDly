/** SSE event from POST /api/prd/refine */
export type RefineStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
