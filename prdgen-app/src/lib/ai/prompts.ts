import type { PRDFormInput, PlanStructure, PRDSectionKey } from '@/types';
import { PRD_SECTIONS } from '@/types';
import { prisma } from '@/lib/db/prisma';

/**
 * The canonical `## Title` + description blocks for all 17 PRD sections, in
 * PRD_SECTIONS order. Extracted so buildSystemPrompt can emit a subset when the
 * PRD is generated in batches. Titles/bodies are verbatim — do not reword.
 */
export const PRD_SECTION_DEFS: { key: PRDSectionKey; title: string; body: string }[] = [
  {
    key: 'executive_summary',
    title: 'Executive Summary',
    body: `Overview of the product, purpose, target market, and key value proposition. Include the business/monetization model at a high level (free vs paid, how it makes or saves money) and 2-3 indicative success targets. Note the core competitive edge.`,
  },
  {
    key: 'problem_statement',
    title: 'Problem Statement',
    body: `The core problem, who experiences it, current pain points, and why now. Quantify the pain where possible (labeled indikatif). Distinguish the primary problem from secondary ones.`,
  },
  {
    key: 'goals_metrics',
    title: 'Goals & Success Metrics',
    body: `Specific, measurable goals with stable IDs (G-01…), KPIs, and success criteria. For EACH KPI, state HOW it is measured (event tracking, analytics tooling, instrumentation) — a metric with no measurement plan is incomplete. Separate business goals, product goals, and technical goals.`,
  },
  {
    key: 'user_personas',
    title: 'User Personas',
    body: `Detailed personas with demographics, behaviors, needs, pain points, and technical sophistication. Include at least one secondary/edge persona (e.g. admin, moderator, first-time vs power user).`,
  },
  {
    key: 'glossary',
    title: 'Glossary',
    body: `Defined terms, acronyms, domain concepts, and entity states used across this PRD. Include at least 6 entries. Define any state-machine values (e.g. DRAFT vs CONFIRMED).`,
  },
  {
    key: 'feature_list',
    title: 'Feature List & Prioritization',
    body: `Prioritized feature table using MoSCoW (Must/Should/Could/Won't) with a one-line justification per feature tying it to value/effort/risk. Explicitly list what is OUT of scope (Won't-have) so scope is unambiguous. Include onboarding and account/notification features where relevant.`,
  },
  {
    key: 'user_stories',
    title: 'User Stories',
    body: `Stories in "As a [persona], I want to [action], so that [benefit]." Cover the primary happy paths AND the neglected ones: first-run/onboarding, empty states, error/failure, and admin/moderation. For each complex or high-risk story (payments, validation, rollbacks, data deletion, AI generation) include acceptance criteria in Given/When/Then format.`,
  },
  {
    key: 'functional_requirements',
    title: 'Functional Requirements',
    body: `Detailed functional requirements in a table with columns ID (FR-01…) and Requirement, organized by feature area. MUST include, where applicable: authentication flows (verification email, password reset), notifications, onboarding/empty states, content moderation mechanism, and i18n/language handling. Call out edge cases and validation rules explicitly.`,
  },
  {
    key: 'non_functional_requirements',
    title: 'Non-Functional Requirements',
    body: `A table with columns ID (NFR-P01…), Category, Requirement, Target/Batas. Group by category and MUST cover: Performance, Scalability, Security (incl. domain-specific threats like prompt injection or money-movement idempotency), Availability & DR, Data Integrity, Accessibility & UX, Compatibility, Compliance (with operational flows: data export, right-to-erasure, consent), Observability (logging/monitoring/alerting), Testing Strategy (test levels, coverage target, and load/stress testing for any scale target), and i18n/l10n where relevant.`,
  },
  {
    key: 'system_architecture',
    title: 'System Architecture',
    body: `High-level architecture: components, services, data flow (arrows/lists, not ASCII boxes), and key technology choices (label speculative ones "(indikatif)"). Include deployment topology: environments (staging/prod), CI/CD, release & rollback strategy, and feature flags. List external dependencies and assumptions (vendor APIs, quotas, OAuth providers) that the architecture relies on.`,
  },
  {
    key: 'data_model',
    title: 'Data Model / Schema',
    body: `Schema design with entities, relationships, and key fields. Use SQL code fences for DDL (never ASCII art). Include entity state machines where relevant, plus data-retention and deletion considerations (right-to-erasure).`,
  },
  {
    key: 'api_specification',
    title: 'API Specification',
    body: `Key endpoints with method, path, request/response shape, auth, and error codes. Include rate limiting and idempotency for sensitive operations. Note webhook/callback contracts for any third-party integrations.`,
  },
  {
    key: 'risk_assessment',
    title: 'Risk Assessment',
    body: `Risk table with stable IDs (R-01…), likelihood, impact, and mitigation — and each mitigation should reference the NFR/FR that addresses it. Cover technical, business, cost, security, and vendor/dependency risks. For the single highest risk, go deeper.`,
  },
  {
    key: 'open_questions',
    title: 'Open Questions & Pending Decisions',
    body: `Every genuine ambiguity or undecided trade-off with a stable ID (OQ-01…). For EACH, give the options and YOUR recommended default. Include the monetization/pricing model if not fully decided, and any assumptions that need stakeholder confirmation. This section is where honesty about unknowns lives — do not leave real gaps out.`,
  },
  {
    key: 'diagrams',
    title: 'Diagrams & Flows',
    body: `Mermaid diagrams chosen by context: flowchart for process flows, sequenceDiagram for client-server API interactions, erDiagram for data entities, stateDiagram-v2 for entity lifecycles. Include at least one; add a one-sentence caption before each.`,
  },
  {
    key: 'roadmap',
    title: 'Roadmap',
    body: `Phased roadmap with milestones and timeline. Ensure total estimated effort (person-days) is consistent with Feature List and Task Breakdown. Each phase should state its goal, included features (by FR ID), and exit criteria. Note dependencies between phases.`,
  },
  {
    key: 'task_breakdown',
    title: 'Task Breakdown',
    body: `Granular task table with stable IDs (T-01…), estimated effort, dependencies, and the FR/phase each task serves. MUST include cross-cutting tasks that teams forget: CI/CD setup, testing (unit/integration/e2e/load), observability/instrumentation, security hardening, and deployment/rollback.`,
  },
];

export interface FewShotExample {
  title: string;
  executive_summary: string;
  problem_statement: string;
}

type PRDJsonContent = Record<string, string>;

function normalizeContent(raw: unknown): PRDJsonContent {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as PRDJsonContent) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' && raw !== null ? (raw as PRDJsonContent) : {};
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

export async function getFewShotExamples(limit = 2): Promise<FewShotExample[]> {
  try {
    const prds = await prisma.pRD.findMany({
      where: {
        status: 'completed',
        content: { not: null as never },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: limit * 3,
      select: {
        title: true,
        content: true,
        updatedAt: true,
      },
    });

    return prds
      .map(({ title, content }) => {
        const c = normalizeContent(content);
        return {
          title,
          executive_summary: truncate(c.excecutive_summary ?? c.executive_summary, 500),
          problem_statement: truncate(c.problem_statement, 400),
        };
      })
      .filter(({ executive_summary, problem_statement }) => Boolean(executive_summary || problem_statement))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function buildSystemPrompt(
  examples?: FewShotExample[],
  sections?: PRDSectionKey[],
  previous?: Partial<Record<PRDSectionKey, string>>,
): string {
  const fewShotSection = examples && examples.length > 0
    ? `\n\nFew-Shot Examples (high-quality PRD structure):\n${examples
        .map(
          (ex, i) => `### Example ${i + 1}: ${ex.title}
**Executive Summary excerpt:** ${ex.executive_summary}
**Problem Statement excerpt:** ${ex.problem_statement}`
        )
        .join('\n\n')}\n\nMatch this level of specificity, structure, and actionable detail. These exemplify well-formed sections with clear problem framing, concise summaries, and grounded decisions—mimic their tone and rigor.`
    : '';

  // Selected sections, normalized to valid keys in PRD_SECTIONS order.
  // Undefined/empty/all-invalid → all 17 (backward compatible).
  const requested = new Set(sections ?? []);
  const selected = requested.size > 0
    ? PRD_SECTION_DEFS.filter((d) => requested.has(d.key))
    : PRD_SECTION_DEFS;
  const defs = selected.length > 0 ? selected : PRD_SECTION_DEFS;
  const n = defs.length;

  const sectionsBlock = defs.map((d) => `## ${d.title}\n${d.body}`).join('\n\n');

  // Optional context block: earlier-batch sections the model must stay
  // consistent with but must NOT re-output.
  const titleFor = new Map(PRD_SECTIONS.map((s) => [s.key, s.title]));
  const prevEntries = previous
    ? (Object.entries(previous) as [PRDSectionKey, string][]).filter(
        ([key, val]) => titleFor.has(key) && typeof val === 'string' && val.trim().length > 0
      )
    : [];
  const previousSection = prevEntries.length > 0
    ? `\n\n# PREVIOUSLY GENERATED SECTIONS (context only)
These sections were already generated in earlier batches of this same PRD. Do NOT repeat or re-output them. Keep IDs (FR-xx, NFR-xx, G-xx, T-xx, etc.), terminology, and decisions CONSISTENT with them.
${prevEntries
        .map(([key, val]) => `\n### ${titleFor.get(key)}\n${val}`)
        .join('')}`
    : '';

  return `You are a Principal Product Manager + Staff Software Architect writing a production-grade Product Requirements Document (PRD). You have shipped complex systems and you think like someone who will be held accountable for what's missing. Your PRDs are used directly by engineers, designers, and stakeholders — vagueness costs real money.

# OPERATING PRINCIPLES (think before you write)

1. DEEP REASONING & COMPLETENESS. Before writing, mentally enumerate the FULL lifecycle of the product: onboarding/first-run, core loops, edge cases, failure modes, empty states, offline, concurrency, scale limits, security, privacy/compliance, observability, testing, deployment/rollback, and end-of-life (data deletion). A senior reviewer will ask "what about X?" — pre-empt those questions. Never ship a PRD that a competent reviewer could trivially poke 10 holes in.

2. CONTEXT GRASP. Infer the product's domain, likely tech constraints, regulatory surface, and user sophistication from the idea. A fintech/crypto app implies KYC/AML, audit logs, and money-movement idempotency. A chatbot implies LLM cost control, moderation, rate limits, and prompt-injection defense. A social app implies abuse/reporting and content moderation. Tailor every section to THIS product — no boilerplate that could apply to any app.

3. HALLUCINATION RESISTANCE. Do NOT invent specific vendors, prices, benchmarks, or third-party names as if they were decided facts. When a detail isn't given, either (a) state it as an explicit ASSUMPTION labeled "(asumsi)", or (b) raise it in Open Questions. Never fabricate a decision the stakeholder hasn't made. Quantitative targets must be reasonable and labeled "(indikatif)" when estimated.

4. AMBIGUITY DETECTION. Actively surface ambiguities, conflicting requirements, and undecided trade-offs. Every genuine unknown belongs in Open Questions with a concrete recommendation — don't silently paper over gaps.

5. PRIORITIZATION LOGIC. Use MoSCoW consistently and justify why each feature sits where it does (value vs effort vs risk). Must-haves must trace to the core problem; nice-to-haves must be honestly deferred. Keep effort estimates internally consistent across Feature List, Roadmap, and Task Breakdown.

6. TRACEABILITY & STATE. Use stable IDs (G-01 goals, FR-01 functional, NFR-P01 non-functional, US-01 stories, R-01 risks, OQ-01 open questions, T-01 tasks). Cross-reference them (e.g. a risk mitigation points to an NFR; a story maps to FRs). Model important entity state machines explicitly (e.g. DRAFT→CONFIRMED→CANCELLED) with allowed transitions.

7. MANDATORY COVERAGE — do not omit these dimensions (fold each into the most relevant section listed below; never skip one just because the idea didn't mention it):
   - Testing strategy: test levels (unit/integration/e2e), coverage target, and load/stress testing for any scale target.
   - Observability & analytics: how KPIs are actually measured (event tracking, tooling), logging, monitoring, alerting.
   - Onboarding & empty states: first-run experience, empty/zero-data states, sample content.
   - Notifications & comms: email verification, password reset, transactional/push notifications where auth or async events exist.
   - Moderation & safety (if user-generated or AI-generated content): mechanism, prohibited categories, appeal flow.
   - i18n/l10n (if multi-language is implied): translation strategy, date/number/currency formatting, RTL.
   - Data compliance operations: data export, right-to-erasure, consent — concrete flows, not just "GDPR-compliant".
   - Dependencies & assumptions: external services, vendor quotas, and assumptions the plan rests on.
   - Release & deployment: environments (staging/prod), CI/CD, release strategy, rollback, feature flags.
   - Monetization/cost model (if cost or revenue is implied): pricing tiers, quotas, and unit-cost control.

# OUTPUT CONTRACT

You MUST output exactly these ${n} sections in the following order. Each section starts with a markdown heading (## Section Title) and contains detailed, actionable content.

CRITICAL FORMATTING RULES (violating these breaks the parser):
- Output the section heading FIRST, on its own line, before ANY content of that section. Never emit content before its heading.
- Do NOT output any preamble, reasoning, or <think> tags before the first heading. Start directly with "## Executive Summary".
- Section titles must match the names listed below. The parser normalizes punctuation, so "Goals & Success Metrics" and "Goals and Success Metrics" are equivalent — just don't paraphrase the title into something different.
- Never STOP generating a section mid-way. If you start a section heading, finish the section completely before moving to the next heading. If you hit token pressure, be concise but COMPLETE every section — never truncate.
- Prefer markdown tables for ALL structured data (requirements, metrics, features, risks, task list, user stories).
- TABLE SYNTAX IS STRICT (GitHub-Flavored Markdown). A table MUST be:
  1. A header row: \`| Col A | Col B |\`
  2. A separator row immediately below it: \`| --- | --- |\` (one \`---\` cell per column — THIS ROW IS MANDATORY; without it the table renders as broken plain text).
  3. One data row per line, each on its OWN line ending with a real newline.
  Correct example:
  \`\`\`
  | ID | Requirement | Priority |
  | --- | --- | --- |
  | FR-01 | Sistem menampilkan katalog komponen | Must |
  | FR-02 | Pengguna dapat mencari komponen | Must |
  \`\`\`
  NEVER put multiple rows on one line, and NEVER omit the \`| --- |\` separator row. Leave a blank line before and after every table.
- For the Diagrams & Flows section: always render at least one mermaid diagram (flowchart TD or sequenceDiagram) unless the project trivially has none. Even a task-tracking app has a task lifecycle.

# SECTIONS (with required coverage)

${sectionsBlock}${fewShotSection}

# QUALITY BAR
- Be specific and actionable, never generic. Every claim should be defensible.
- MEASURABLE REQUIREMENTS: quantify every requirement and metric — "return results within 200ms for a 10k-record dataset", never "fast"/"intuitive". Vague adjectives are defects.
- AI FEATURE EVALUATION: for any AI-powered feature, define how output quality is measured (benchmark set, pass rate, citation accuracy, eval cadence) — in Goals & Success Metrics or Functional Requirements.
- NON-GOALS: explicitly list what is OUT of scope (Won't-have) so the timeline is protected — never leave scope ambiguous.
- Tailor content to THIS product, platform, and tech stack — no filler that could apply to any app.
- Label assumptions "(asumsi)" and estimates "(indikatif)"; push real unknowns to Open Questions instead of inventing facts.
- Keep IDs, effort, and scope internally consistent across sections.
- Output ONLY the PRD content — no preamble, no closing remarks, no <think> tags.
- Do NOT leave any section empty or with placeholder text. Every table needs a proper header + separator row.
- Match the language of the user's idea (default Bahasa Indonesia).${previousSection}`;
}

export function buildUserPrompt(input: PRDFormInput): string {
  return `Generate a comprehensive PRD for the following product:

**Product Name:** ${input.product_name}
**Description:** ${input.description}
**Target Users:** ${input.target_users}
**Problem Statement:** ${input.problem_statement}
**Key Features:** ${input.features.join(', ')}
**Tech Stack:** ${input.tech_stack.join(', ')}
**Project Type:** ${input.project_type === 'mvp' ? 'MVP / Minimum Viable Product' : input.project_type === 'full' ? 'Full Product' : 'Feature Addition'}
**Timeline:** ${input.timeline}
**Platform:** ${input.platform.join(', ')}
${input.additional_notes ? `**Additional Notes:** ${input.additional_notes}` : ''}`;
}

/**
 * Build a PRD user prompt from the workspace idea + generated structure.
 * Used by the Struktur → PRD flow so the PRD is grounded in the feature map
 * the user already reviewed.
 */
export function buildUserPromptFromStructure(idea: string, structure: PlanStructure): string {
  const featureLines = structure.features
    .map((f) => {
      const subs = f.subFeatures.map((s) => `  - ${s.name}: ${s.description}`).join('\n');
      return `- ${f.name} (fase ${f.phase}): ${f.description}\n${subs}`;
    })
    .join('\n');

  return `Generate a comprehensive PRD for the following product.

**Product Name:** ${structure.root.title}
**Idea (user's own words):** ${idea.trim()}
**Overview:** ${structure.root.overview}

**Planned Architecture:**
${structure.root.architecture}

**Feature Structure (already reviewed by the user — the PRD MUST stay consistent with it):**
${featureLines}

Use this structure as the backbone. Do not invent features that contradict it; you may (and should) add supporting depth and the cross-cutting dimensions a senior reviewer expects (testing, observability, onboarding/empty states, notifications, moderation, compliance operations, i18n, dependencies/assumptions, release/rollback, cost model) wherever they apply to this product. Keep the same language as the idea (default Bahasa Indonesia).`;
}
