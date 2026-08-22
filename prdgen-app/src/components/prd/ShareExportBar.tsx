'use client';

import { Copy, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { copyToClipboard, downloadMarkdown } from '@/lib/export';

interface ShareExportBarProps {
  markdown: string;
  title: string;
}

export function ShareExportBar({ markdown, title }: ShareExportBarProps) {
  async function handleCopy() {
    const ok = await copyToClipboard(markdown);
    toast.add({
      title: ok ? 'Tersalin!' : 'Gagal menyalin',
      description: ok ? 'Markdown disalin ke clipboard.' : 'Tidak bisa menyalin.',
      type: ok ? 'success' : 'error',
    });
  }

  function handleDownload() {
    downloadMarkdown(markdown, `${title.replace(/\s+/g, '-').toLowerCase()}.md`);
    toast.add({ title: 'Download dimulai', type: 'info' });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
        <Copy className="size-3.5" /> <span className="hidden sm:inline">Copy</span>
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
        <Download className="size-3.5" /> <span className="hidden sm:inline">.md</span>
      </Button>
      <Button size="sm" className="gap-1.5" onClick={handlePrint}>
        <Printer className="size-3.5" /> <span className="hidden sm:inline">PDF</span>
      </Button>
    </div>
  );
}
