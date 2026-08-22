import { notFound } from 'next/navigation';
import { Calendar, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Mock blog post content — in production this would load from MDX files
const POSTS: Record<string, { title: string; date: string; author: string; content: string }> = {
  'cara-menulis-prd-yang-baik': {
    title: 'Cara Menulis PRD yang Baik untuk AI Coding Agent',
    date: '2026-08-01',
    author: 'Tim PRDly',
    content: `
## Pendahuluan

Product Requirements Document (PRD) yang baik adalah fondasi dari project development yang sukses. Artikel ini membahas cara menulis PRD yang efektif, terutama untuk AI coding agent seperti Cursor, Windsurf, dan Bolt.

## 1. Mulai dengan Problem Statement yang Jelas

PRD yang baik dimulai dengan pemahaman mendalam tentang masalah yang ingin diselesaikan. Jangan langsung melompat ke solusi.

**Contoh buruk:**
> Kita perlu aplikasi untuk manage tugas.

**Contoh baik:**
> Tim remote kami kesulitan track progress proyek karena informasi tersebar di 5 tools berbeda. Ini menyebabkan duplikasi tugas dan meeting overhead 30% dari waktu kerja.

## 2. Definisikan User Personas dengan Detail

AI coding agent butuh konteks yang kaya tentang siapa yang akan menggunakan produk Anda.

Sertakan:
- Demografi dan role
- Goals dan motivasi
- Pain points spesifik
- Behavior patterns

## 3. Pecah Features menjadi User Stories

Format: "Sebagai [persona], saya ingin [action] agar [value]"

Ini membantu AI memahami WHY di balik setiap fitur, bukan hanya WHAT.

## 4. Spesifikasikan Tech Stack dengan Jelas

Jangan biarkan AI menebak. Sebutkan:
- Framework (Next.js, React, Vue, dll)
- Database (PostgreSQL, MongoDB, dll)
- Styling (Tailwind, CSS Modules, dll)
- State management (Zustand, Redux, dll)

## 5. Sertakan Acceptance Criteria

Untuk setiap fitur, definisikan kriteria sukses yang bisa diukur.

---

**Kesimpulan:** PRD yang baik menghemat waktu development dan menghasilkan kode yang lebih konsisten. Gunakan PRDly untuk membuat PRD profesional dalam hitungan menit.
    `,
  },
  'mengapa-prd-penting': {
    title: 'Mengapa PRD Penting Sebelum Mulai Coding',
    date: '2026-07-28',
    author: 'Tim PRDly',
    content: `
## Mengapa PRD Penting?

Banyak developer yang langsung coding tanpa planning. Ini menghemat waktu di awal, tapi justru menambah waktu 2-3x lipat di tengah project karena scope creep dan refactoring.

## Manfaat PRD

### 1. Clarity

Semua stakeholder punya pemahaman yang sama tentang apa yang akan dibangun.

### 2. Efficiency

AI coding agent bekerja lebih akurat dengan konteks yang jelas dari PRD.

### 3. Documentation

PRD adalah dokumentasi hidup yang bisa di-update seiring waktu.

## Statistik

- 50% pengurangan waktu development
- 70% lebih sedikit bug di production
- 90% stakeholder satisfaction meningkat

Mulai buat PRD Anda sekarang!
    `,
  },
  'tips-menggunakan-ai-model': {
    title: '5 Tips Memilih AI Model yang Tepat untuk Generate PRD',
    date: '2026-07-25',
    author: 'Tim PRDly',
    content: `
## Model Comparison

### GPT-4o
- **Kecepatan:** Tinggi
- **Kualitas:** Baik
- **Best for:** PRD standard, MVP scope

### Claude Opus
- **Kecepatan:** Medium
- **Kualitas:** Excellent
- **Best for:** PRD komprehensif, enterprise project

### Gemini 2.5 Pro
- **Kecepatan:** Sangat Tinggi
- **Kualitas:** Baik
- **Best for:** Iterasi cepat, prototype

## Tips Memilih

1. **Untuk MVP:** Gunakan Gemini Flash atau GPT-4o
2. **Untuk Enterprise:** Gunakan Claude Opus
3. **Untuk Iterasi:** Gunakan model tercepat
4. **Budget Terbatas:** Mulai dari Free tier dengan Gemini Flash
5. **Kualitas Maksimal:** Claude Opus atau GPT-5

Pilih model sesuai kebutuhan dan budget Anda!
    `,
  },
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = POSTS[slug];
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header className="mb-8 border-b border-border-paper pb-6">
        <h1 className="mb-4 text-3xl font-bold text-ink sm:text-4xl">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-ink-dim">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-4" />
            {new Date(post.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <span className="flex items-center gap-1.5">
            <User className="size-4" />
            {post.author}
          </span>
        </div>
      </header>

      <div className="markdown-body max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
      </div>
    </article>
  );
}

export async function generateStaticParams() {
  return Object.keys(POSTS).map((slug) => ({ slug }));
}
