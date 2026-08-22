import Link from 'next/link';
import { Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MOCK_POSTS = [
  {
    slug: 'cara-menulis-prd-yang-baik',
    title: 'Cara Menulis PRD yang Baik untuk AI Coding Agent',
    excerpt: 'Panduan lengkap menulis Product Requirements Document yang efektif untuk Cursor, Windsurf, dan tool AI coding lainnya.',
    date: '2026-08-01',
    author: 'Tim PRDly',
    readTime: '5 min',
  },
  {
    slug: 'mengapa-prd-penting',
    title: 'Mengapa PRD Penting Sebelum Mulai Coding',
    excerpt: 'Mengapa product planning yang baik menghemat waktu development hingga 50% dan mengurangi bug di production.',
    date: '2026-07-28',
    author: 'Tim PRDly',
    readTime: '4 min',
  },
  {
    slug: 'tips-menggunakan-ai-model',
    title: '5 Tips Memilih AI Model yang Tepat untuk Generate PRD',
    excerpt: 'Kapan menggunakan GPT-4o, Claude Opus, atau Gemini? Panduan lengkap memilih model AI berdasarkan kebutuhan Anda.',
    date: '2026-07-25',
    author: 'Tim PRDly',
    readTime: '6 min',
  },
];

export default function BlogIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Blog</h1>
        <p className="mt-3 text-ink-dim">
          Tips, tutorial, dan insight tentang PRD, AI coding, dan product development
        </p>
      </div>

      <div className="space-y-8">
        {MOCK_POSTS.map((post) => (
          <article
            key={post.slug}
            className="rounded-xl border border-border-paper bg-paper-raised p-6 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center gap-3 text-xs text-ink-dim">
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                {new Date(post.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span>•</span>
              <span>{post.author}</span>
              <span>•</span>
              <span>{post.readTime} baca</span>
            </div>

            <Link href={`/blog/${post.slug}`}>
              <h2 className="mb-2 text-xl font-bold text-ink hover:text-primary">
                {post.title}
              </h2>
            </Link>

            <p className="mb-4 text-ink-faint">{post.excerpt}</p>

            <Link href={`/blog/${post.slug}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 px-0">
                Baca selengkapnya
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
