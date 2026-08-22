// ── User ──
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

// ── PRD ──
export type PRDStatus = 'draft' | 'generating' | 'completed' | 'failed';

export interface PRDContent {
  executive_summary: string;
  problem_statement: string;
  goals_metrics: string;
  user_personas: string;
  glossary: string;
  feature_list: string;
  user_stories: string;
  functional_requirements: string;
  non_functional_requirements: string;
  system_architecture: string;
  data_model: string;
  api_specification: string;
  risk_assessment: string;
  open_questions: string;
  diagrams: string;
  roadmap: string;
  task_breakdown: string;
}

export type PRDSectionKey = keyof PRDContent;

export const PRD_SECTIONS: { key: PRDSectionKey; title: string }[] = [
  { key: 'executive_summary', title: 'Executive Summary' },
  { key: 'problem_statement', title: 'Problem Statement' },
  { key: 'goals_metrics', title: 'Goals & Success Metrics' },
  { key: 'user_personas', title: 'User Personas' },
  { key: 'glossary', title: 'Glossary' },
  { key: 'feature_list', title: 'Feature List & Prioritization' },
  { key: 'user_stories', title: 'User Stories' },
  { key: 'functional_requirements', title: 'Functional Requirements' },
  { key: 'non_functional_requirements', title: 'Non-Functional Requirements' },
  { key: 'system_architecture', title: 'System Architecture' },
  { key: 'data_model', title: 'Data Model / Schema' },
  { key: 'api_specification', title: 'API Specification' },
  { key: 'risk_assessment', title: 'Risk Assessment' },
  { key: 'open_questions', title: 'Open Questions & Pending Decisions' },
  { key: 'diagrams', title: 'Diagrams & Flows' },
  { key: 'roadmap', title: 'Roadmap' },
  { key: 'task_breakdown', title: 'Task Breakdown' },
];

export interface PRD {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: PRDStatus;
  content: PRDContent | null;
  markdown_content: string | null;
  model_used: string | null;
  idea?: string | null;
  structure?: PlanStructure | null;
  created_at: string;
  updated_at: string;
}

// ── PRD Form ──
export type ProjectType = 'mvp' | 'full' | 'feature';

export interface PRDFormInput {
  product_name: string;
  description: string;
  target_users: string;
  problem_statement: string;
  features: string[];
  tech_stack: string[];
  project_type: ProjectType;
  timeline: string;
  platform: string[];
  additional_notes: string;
}

// ── AI Models ──
export interface AIModel {
  id: string;
  name: string;
  provider: string;
  speed: number;
  quality: number;
}

// ── Streaming ──
export type StreamEvent =
  | { type: 'section_start'; section: PRDSectionKey }
  | { type: 'token'; content: string }
  | { type: 'thinking' }
  | { type: 'section_end'; section: PRDSectionKey }
  | { type: 'done'; prd_id: string }
  | { type: 'error'; message: string };

// ── Workspace Plan (Struktur → PRD → Task flow) ──

/** The phases of the workspace flow, mirrors the top stepper. */
export type PlanStep = 'structure' | 'prd';

export const PLAN_STEPS: { key: PlanStep; label: string }[] = [
  { key: 'structure', label: 'Struktur' },
  { key: 'prd', label: 'PRD' },
];

/** A single implementation task under a feature. */
export interface PlanTask {
  id: string;
  title: string;
  description: string;
  done: boolean;
}

/** A sub-feature (leaf) under a feature node. */
export interface PlanSubFeature {
  id: string;
  name: string;
  description: string;
}

/** A top-level feature node in the mindmap. */
export interface PlanFeature {
  id: string;
  name: string;
  description: string;
  /** Delivery phase — renders as the "FASE 1/2/3" badge. */
  phase: number;
  subFeatures: PlanSubFeature[];
  tasks: PlanTask[];
}

/** The root "Perencanaan" node: high-level plan + architecture. */
export interface PlanRoot {
  title: string;
  overview: string;
  /** Plain-text/markdown architecture description (components + data flow). */
  architecture: string;
}

/** The full structure produced by the Struktur phase. */
export interface PlanStructure {
  root: PlanRoot;
  features: PlanFeature[];
}

/** Everything a workspace persists across the three phases. */
export interface WorkspacePlan {
  idea: string;
  structure: PlanStructure | null;
  prd: Partial<PRDContent>;
  /** Which phases the user has completed/unlocked. */
  completedSteps: PlanStep[];
}

/** Streaming events for structure generation (SSE). */
export type StructureStreamEvent =
  | { type: 'thinking' }
  | { type: 'token'; content: string }
  | { type: 'structure'; structure: PlanStructure }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Streaming events for task generation (SSE). */
export type TaskStreamEvent =
  | { type: 'thinking' }
  | { type: 'token'; content: string }
  | { type: 'tasks'; features: { id: string; tasks: PlanTask[] }[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

// ── Shared Links ──
export interface SharedLink {
  id: string;
  prd_id: string;
  token: string;
  is_active: boolean;
  expires_at: string | null;
}
