import type { PRD } from '@/types';
import { PRD_SECTIONS } from '@/types';

export function generateFullMarkdown(prd: PRD): string {
  if (!prd.content) return '';

  const lines: string[] = [`# ${prd.title}`, ''];

  for (const { key, title } of PRD_SECTIONS) {
    const body = prd.content[key];
    if (body) {
      lines.push(`## ${title}`, '', body, '');
    }
  }

  return lines.join('\n');
}

export async function copyToClipboard(markdown: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch {
    return false;
  }
}

export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
