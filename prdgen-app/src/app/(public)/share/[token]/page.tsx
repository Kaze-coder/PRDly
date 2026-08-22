import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { MOCK_PRDS, MOCK_PRD_CONTENT } from '@/lib/mock-data';
import { PRD_SECTIONS } from '@/types';
import { SharedMarkdown } from '@/components/prd/SharedMarkdown';
import { ShareExportBar } from '@/components/prd/ShareExportBar';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Logo } from '@/components/shared/Logo';
import { generateFullMarkdown } from '@/lib/export';
import type { PRD } from '@/types';

// Mock: any non-empty token resolves to the first completed PRD.
// In production this would look up shared_links by token.
function resolvePRD(token: string): PRD | null {
  if (!token) return null;
  const prd = MOCK_PRDS.find((p) => p.status === 'completed') ?? MOCK_PRDS[0];
  if (!prd) return null;
  return { ...prd, content: prd.content ?? MOCK_PRD_CONTENT };
}

export default async function SharedPRDPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const prd = resolvePRD(token);
  if (!prd) notFound();

  const markdown = generateFullMarkdown(prd);
  const sections = PRD_SECTIONS.filter((s) => prd.content?.[s.key]);

  return (
    <div className="min-h-screen bg-paper">
      {/* Minimal public header */}
      <header className="sticky top-0 z-40 border-b border-border bg-paper/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Logo size={32} />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ShareExportBar markdown={markdown} title={prd.title} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-xl border border-border-paper bg-paper-raised p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
          {/* Document header */}
          <div className="mb-8 border-b border-border-paper pb-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
              <FileText className="size-3.5" />
              Product Requirements Document
            </div>
            <h1 className="text-3xl font-bold text-ink">{prd.title}</h1>
            {prd.description && (
              <p className="mt-2 text-ink-dim">{prd.description}</p>
            )}
            <p className="mt-3 text-xs text-ink-faint">
              Dibuat: {new Date(prd.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              {prd.model_used && ` • Model: ${prd.model_used}`}
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.key}>
                <SharedMarkdown content={prd.content![section.key]} />
              </section>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint print:hidden">
          Dibuat dengan{' '}
          <Link href="/" className="text-primary hover:underline">
            PRDly
          </Link>
        </p>
      </main>
    </div>
  );
}
