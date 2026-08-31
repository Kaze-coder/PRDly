import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';

export const dynamic = 'force-dynamic';

/**
 * Extract plain text from uploaded documents/images.
 * - Office/PDF: officeparser (docx/pptx/xlsx/pdf/odt/odp/ods)
 * - Images: tesseract.js OCR (eng)
 * - Text-like: utf8 decode
 * Everything runs server-side; the heavy parsers live in serverExternalPackages.
 */

const MAX_FILES = 10;
const MAX_BYTES = 25 * 1024 * 1024; // 25MB per file
const MAX_CHARS = 50_000; // cap per file

type Kind = 'office' | 'pdf' | 'image' | 'text' | 'unknown';

const OFFICE_EXTS = new Set(['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'tif']);
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'html', 'htm', 'xml',
  'yaml', 'yml', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go',
  'rs', 'java', 'c', 'h', 'cpp', 'cs', 'php', 'sh', 'sql', 'ini', 'toml',
  'env', 'css', 'scss',
]);

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

// Collapse runs of 3+ blank lines to a single blank line, trim edges.
function normalize(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Heuristic: NUL bytes or a high ratio of control chars ⇒ binary.
function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000);
  if (len === 0) return false;
  let control = 0;
  for (let i = 0; i < len; i++) {
    const b = buf[i];
    if (b === 0) return true;
    // allow tab(9), LF(10), CR(13), and printable >= 32
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / len > 0.3;
}

function kindFor(ext: string, type: string): Kind {
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (OFFICE_EXTS.has(ext)) return 'office';
  if (IMAGE_EXTS.has(ext) || type.startsWith('image/')) return 'image';
  if (TEXT_EXTS.has(ext) || type.startsWith('text/')) return 'text';
  return 'unknown';
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: 'Tidak ada file.' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maksimal ${MAX_FILES} file.` }, { status: 400 });
  }

  type FileResult = { name: string; chars: number; kind: Kind; error?: string };
  const results: FileResult[] = [];
  const parts: string[] = [];

  // One OCR worker per request, reused across all images, terminated in finally.
  let ocrWorker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | null = null;

  try {
    for (const file of files) {
      const name = file.name || 'file';
      const ext = extOf(name);
      const type = (file.type || '').toLowerCase();
      const kind = kindFor(ext, type);

      if (file.size > MAX_BYTES) {
        results.push({ name, chars: 0, kind, error: 'File melebihi 25MB, dilewati.' });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        let text = '';
        let resolvedKind: Kind = kind;

        if (kind === 'office' || kind === 'pdf') {
          const { parseOffice } = await import('officeparser');
          const ast = await parseOffice(buffer);
          text = ast.toText();
        } else if (kind === 'image') {
          if (!ocrWorker) {
            const { createWorker } = await import('tesseract.js');
            ocrWorker = await createWorker('eng');
          }
          const { data } = await ocrWorker.recognize(buffer);
          text = data.text;
        } else if (kind === 'text') {
          text = buffer.toString('utf8');
        } else {
          // unknown → attempt utf8, but bail if it's binary
          if (looksBinary(buffer)) {
            results.push({ name, chars: 0, kind: 'unknown', error: 'Format tidak didukung (biner).' });
            continue;
          }
          text = buffer.toString('utf8');
          resolvedKind = 'text';
        }

        text = normalize(text);
        if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

        results.push({ name, chars: text.length, kind: resolvedKind });
        if (text) parts.push(`\n\n--- ${name} ---\n${text}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gagal mengekstrak teks.';
        results.push({ name, chars: 0, kind, error: message });
      }
    }
  } finally {
    if (ocrWorker) {
      try {
        await ocrWorker.terminate();
      } catch {
        // ignore terminate failures
      }
    }
  }

  return NextResponse.json({ data: { text: parts.join('').trim(), files: results } });
}
