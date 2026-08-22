import type { PRD, PRDContent } from '@/types';

export const MOCK_PRD_CONTENT: PRDContent = {
  executive_summary: `## Executive Summary

**TaskFlow Pro** adalah aplikasi manajemen tugas berbasis AI yang dirancang untuk tim remote modern. Platform ini menggabungkan kecerdasan buatan untuk auto-prioritasi tugas, deteksi bottleneck, dan rekomendasi alur kerja yang personal.

**Target Pasar:** Tim remote ukuran kecil-menengah (5–50 orang) di Indonesia dan Asia Tenggara.

**Value Proposition:**
- Hemat 2–3 jam per hari per anggota tim dengan AI auto-routing
- Visibilitas real-time terhadap progres seluruh proyek
- Integrasi seamless dengan tools yang sudah ada (Slack, GitHub, Figma)`,

  problem_statement: `## Problem Statement

Tim remote menghadapi tantangan koordinasi yang signifikan:

1. **Komunikasi yang terputus-putus** — Informasi tersebar di berbagai platform (Slack, email, Notion)
2. **Kurangnya visibilitas** — PM tidak dapat melihat bottleneck secara real-time
3. **Meeting overhead** — 30–40% waktu kerja dihabiskan untuk status meetings

**Pain Points Utama:**
| Pain Point | Dampak | Frekuensi |
|---|---|---|
| Duplikasi tugas | Waste 4 jam/minggu | Setiap sprint |
| Deadline terlewat | Denda kontrak | 2–3x/bulan |
| Context switching | -40% produktivitas | Setiap hari |`,

  goals_metrics: `## Goals & Success Metrics

### Business Goals
- Akuisisi 1.000 tim aktif dalam 6 bulan pertama
- MRR Rp 500 juta dalam 12 bulan
- NPS > 50

### Product Goals
| Metric | Baseline | Target (3 bulan) | Target (6 bulan) |
|---|---|---|---|
| Task completion rate | 65% | 80% | 90% |
| Meeting reduction | 0% | 20% | 40% |
| Time-to-assign | 2 hari | 4 jam | 1 jam |`,

  user_personas: `## User Personas

### Persona 1: Rina — Project Manager
- **Usia:** 28 tahun, Jakarta
- **Role:** PM di startup SaaS, tim 12 orang remote
- **Goals:** Deliver sprint on time, visibilitas penuh
- **Frustrasi:** Harus aggregat update dari 5 tools berbeda

### Persona 2: Budi — Software Engineer
- **Usia:** 25 tahun, Yogyakarta
- **Role:** Full-stack dev, WFH penuh
- **Goals:** Fokus coding tanpa distraksi meeting
- **Frustrasi:** Tugas tidak jelas prioritasnya`,

  feature_list: `## Feature List & Prioritization

### Must Have (MoSCoW)
- ✅ Dashboard tim dengan real-time updates
- ✅ AI auto-prioritasi berdasarkan deadline & dependencies
- ✅ Kanban board drag-and-drop
- ✅ Notifikasi cerdas (hanya notify yang relevan)

### Should Have
- 🔵 Integrasi GitHub Issues
- 🔵 Time tracking terintegrasi
- 🔵 Laporan mingguan otomatis

### Could Have
- 🟡 Mobile app (iOS/Android)
- 🟡 Custom workflow templates`,

  user_stories: `## User Stories

**Epic: Task Management**

\`\`\`
As a Project Manager,
I want to see all team tasks on one dashboard,
So that I can identify bottlenecks without asking for updates.

As a Developer,
I want AI to suggest which task to work on next,
So that I can maximize focus time without context switching.

As a Team Lead,
I want to get alerts when a sprint is at risk,
So that I can take corrective action before the deadline.
\`\`\``,

  functional_requirements: `## Functional Requirements

### FR-01: Authentication
- Login via Google OAuth 2.0 dan email/password
- MFA opsional
- SSO untuk enterprise (SAML 2.0)

### FR-02: Task Management
- CRUD task dengan field: judul, deskripsi, assignee, deadline, priority, labels
- Drag-and-drop antar kolom Kanban
- Subtask support (max 3 level)
- File attachment (max 25 MB/file)

### FR-03: AI Prioritization Engine
- Analisis dependency graph otomatis
- Scoring priority berdasarkan: deadline proximity, blocking impact, assignee workload
- Rekomendasi diperbarui setiap 15 menit`,

  non_functional_requirements: `## Non-Functional Requirements

### Performance
- API response time P95 < 200ms
- Dashboard load time < 1.5 detik (LCP)
- Real-time sync latency < 500ms

### Scalability
- Horizontal scaling hingga 10.000 concurrent users
- Data sharding per workspace

### Security
- Enkripsi at-rest (AES-256) dan in-transit (TLS 1.3)
- SOC 2 Type II compliance roadmap
- GDPR-compliant data handling

### Availability
- SLA 99.9% uptime
- Disaster recovery RTO < 4 jam`,

  system_architecture: `## System Architecture

\`\`\`
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│         Next.js 15 + React 19               │
│    Zustand state • TanStack Query cache      │
└──────────────────┬──────────────────────────┘
                   │ HTTPS / WebSocket
┌──────────────────▼──────────────────────────┐
│              API Gateway (Nginx)             │
└──────────────────┬──────────────────────────┘
         ┌─────────┼─────────┐
┌────────▼───┐ ┌───▼────┐ ┌──▼──────────┐
│ Task API   │ │AI Svc  │ │ Auth Svc    │
│ (Node.js)  │ │(Python)│ │ (Supabase)  │
└────────┬───┘ └───┬────┘ └─────────────┘
         │         │
┌────────▼─────────▼─────────────────────────┐
│          PostgreSQL + Redis Cache           │
└─────────────────────────────────────────────┘
\`\`\``,

  data_model: `## Data Model / Schema

\`\`\`sql
-- Core entities
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES users(id),
  status TEXT CHECK (status IN ('todo','in_progress','review','done')),
  priority INTEGER DEFAULT 50, -- 0-100 AI score
  deadline TIMESTAMPTZ,
  parent_id UUID REFERENCES tasks(id), -- for subtasks
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_workspace_status ON tasks(workspace_id, status);
\`\`\``,

  api_specification: `## API Specification

### Base URL: \`https://api.taskflowpro.id/v1\`

#### GET /tasks
\`\`\`
Authorization: Bearer {token}
Query: workspace_id, status?, assignee_id?, page, limit

Response 200:
{
  "data": [{ "id": "...", "title": "...", "priority": 85 }],
  "meta": { "total": 142, "page": 1 }
}
\`\`\`

#### POST /tasks
\`\`\`
Body: { "title": string, "deadline": ISO8601, "assignee_id": UUID }
Response 201: Created task object
\`\`\`

#### POST /ai/prioritize
\`\`\`
Body: { "workspace_id": UUID }
Response 200: { "suggestions": [{ "task_id": UUID, "new_priority": number, "reason": string }] }
\`\`\``,

  risk_assessment: `## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI model accuracy rendah | Medium | High | A/B test, feedback loop, human override |
| Skalabilitas WebSocket | Low | High | Redis pub/sub, connection pooling |
| Adopsi lambat | High | High | Onboarding wizard, template library |
| Data breach | Low | Critical | Penetration testing, bug bounty program |
| Kompetitor (Asana, Linear) | High | Medium | Fokus pada SMB Indonesia, harga lokal |`,

  roadmap: `## Roadmap

### Phase 1: Foundation (Bulan 1–2)
- [ ] Setup infra (Supabase, Vercel, Redis)
- [ ] Auth + workspace management
- [ ] Basic Kanban board
- [ ] Task CRUD

### Phase 2: Core Features (Bulan 3–4)
- [ ] AI prioritization engine v1
- [ ] Real-time collaboration
- [ ] Notifikasi system
- [ ] GitHub integration

### Phase 3: Growth (Bulan 5–6)
- [ ] Mobile app (React Native)
- [ ] Advanced analytics
- [ ] Public API
- [ ] Enterprise SSO`,

  task_breakdown: `## Task Breakdown

### Sprint 1 (2 minggu) — Foundation
| Task | Estimasi | Assignee |
|---|---|---|
| Setup Next.js + Supabase | 1 hari | Full-stack |
| Database schema design | 0.5 hari | Backend |
| Auth flow (Google OAuth) | 2 hari | Backend |
| Dashboard layout | 1 hari | Frontend |
| Basic task CRUD API | 3 hari | Backend |
| Kanban board UI | 3 hari | Frontend |

### Sprint 2 (2 minggu) — AI Engine
| Task | Estimasi | Assignee |
|---|---|---|
| Priority scoring algorithm | 3 hari | AI/ML |
| WebSocket real-time sync | 2 hari | Backend |
| Notification system | 2 hari | Backend |
| Integration tests | 3 hari | QA |`,

  diagrams: '',

  glossary: `## Glossary

| Istilah | Definisi |
|---------|----------|
| **SKU** | Stock Keeping Unit — kode unik per barang |
| **Mutasi** | Pergerakan stok: masuk (IN), keluar (OUT), atau penyesuaian (ADJUSTMENT) |
| **Ledger** | Tabel append-only yang mencatat semua mutasi stok |
| **Person-days (pd)** | Satuan estimasi kerja: 1 orang × 1 hari kerja |
| **RBAC** | Role-Based Access Control — otorisasi berdasarkan peran user |`,

  open_questions: `## Open Questions & Pending Decisions

| # | Pertanyaan | Owner | Status |
|---|-----------|-------|--------|
| OQ-01 | Siapa yang bisa cancel transaksi CONFIRMED (ADMIN only atau juga Kepala Gudang)? | CTO/PM | Menunggu keputusan |
| OQ-02 | Apakah kop surat jalan hardcoded atau configurable per perusahaan? | PM | Menunggu input stakeholder |
| OQ-03 | Apakah perlu approval workflow bertingkat (staff input → kepala gudang approve)? | PM | Backlog Rilis 1.2 |
| OQ-04 | Batas maksimum user konkuren sebelum perlu scale-out? | DevOps | Atau evaluasi pasca-launch |
| OQ-05 | Kebijakan retensi data audit log (berapa lama disimpan)? | Compliance | Default 1 tahun (draft) |`,
};

export const MOCK_PRDS: PRD[] = [
  {
    id: 'prd-001',
    user_id: 'user-mock',
    title: 'TaskFlow Pro — AI Task Manager',
    description: 'Aplikasi manajemen tugas berbasis AI untuk tim remote',
    status: 'completed',
    content: MOCK_PRD_CONTENT,
    markdown_content: null,
    model_used: 'gemini-flash',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'prd-002',
    user_id: 'user-mock',
    title: 'KopiKita — Platform E-commerce Kopi Artisan',
    description: 'Marketplace kopi single origin dari petani lokal',
    status: 'completed',
    content: null,
    markdown_content: null,
    model_used: 'gpt-4o',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'prd-003',
    user_id: 'user-mock',
    title: 'BelajarAI — LMS untuk Developer',
    description: 'Platform belajar AI/ML dengan project-based learning',
    status: 'draft',
    content: null,
    markdown_content: null,
    model_used: null,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
];
