'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ArrowLeft, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { generateFullMarkdown, copyToClipboard, downloadMarkdown } from '@/lib/export';
import { MOCK_PRDS } from '@/lib/mock-data';
import { PRD_SECTIONS } from '@/types';

export default function PRDPreviewPage() {
  const params = useParams();
  const prdId = params.id as string;
  const prd = MOCK_PRDS.find((p) => p.id === prdId) ?? MOCK_PRDS[0];

  const markdown = generateFullMarkdown(prd);

  async function handleCopy() {
    const ok = await copyToClipboard(markdown);
    toast.add({ title: ok ? 'Tersalin!' : 'Gagal menyalin', type: ok ? 'success' : 'error' });
  }

  function handleDownload() {
    downloadMarkdown(markdown, `${prd.title.replace(/\s+/g, '-').toLowerCase()}.md`);
    toast.add({ title: 'Download dimulai', type: 'info' });
  }

  return (
    <div className="mx-auto max-w-4xl pb-12">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href={`/prd/${prdId}`} />}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-bold text-ink">Preview: {prd.title}</h1>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
          <Copy className="size-3.5" />
          Copy
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
          <Download className="size-3.5" />
          Download .md
        </Button>
      </div>

      {/* Content */}
      <div className="rounded-xl border bg-paper-raised p-6 sm:p-10 print:border-none print:p-0">
        <article className="markdown-body max-w-none text-ink">
          <h1>{prd.title}</h1>
          {prd.content &&
            PRD_SECTIONS.map(({ key }) => {
              const body = prd.content![key];
              if (!body) return null;
              return (
                <section key={key}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {body}
                  </ReactMarkdown>
                </section>
              );
            })}
          {!prd.content && (
            <p className="italic text-ink-dim">PRD ini belum memiliki konten.</p>
          )}
        </article>
      </div>
    </div>
  );
}
