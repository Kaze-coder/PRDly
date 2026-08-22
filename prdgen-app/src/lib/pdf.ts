/**
 * Client-side PDF export for a PRD document.
 * Builds a clean, print-neutral export HTML inside a hidden container,
 * renders it via html2pdf.js (html2canvas + jsPDF), then cleans up.
 */
export async function exportPRDToPdf(
  prd: { title: string; created_at: string },
  sectionsHtml: string
): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;

  const parsed = new Date(prd.created_at);
  const date = (isNaN(parsed.getTime()) ? new Date() : parsed).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;left:-10000px;top:0;width:190mm;background:#ffffff;color:#1f2937;';
  container.innerHTML = `
    <style>
      .prd-pdf { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; font-size: 11pt; }
      .prd-pdf .pdf-cover { border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 8px; }
      .prd-pdf .pdf-cover h1 { font-size: 24pt; margin: 0 0 6px; color: #111827; font-weight: 700; }
      .prd-pdf .pdf-meta { font-family: ui-monospace, monospace; font-size: 9pt; color: #6b7280; letter-spacing: .04em; }
      .prd-pdf .pdf-section { page-break-before: always; }
      .prd-pdf .pdf-section:first-of-type { page-break-before: auto; }
      .prd-pdf .pdf-section > h2 {
        font-size: 15pt; color: #111827; margin: 0 0 10px; padding-bottom: 6px;
        border-bottom: 1px solid #d1d5db; page-break-after: avoid;
      }
      .prd-pdf .markdown-body { font-size: 10.5pt; color: #1f2937; }
      .prd-pdf .markdown-body h1, .prd-pdf .markdown-body h2, .prd-pdf .markdown-body h3,
      .prd-pdf .markdown-body h4 { color: #111827; page-break-after: avoid; }
      .prd-pdf .markdown-body pre, .prd-pdf .markdown-body blockquote { page-break-inside: avoid; }
      .prd-pdf .markdown-body pre { background: #f3f4f6 !important; border: 1px solid #e5e7eb; }
      .prd-pdf .markdown-body table { border-collapse: collapse; width: 100%; }
      .prd-pdf .markdown-body th, .prd-pdf .markdown-body td { border: 1px solid #d1d5db; padding: 4px 8px; }
      .prd-pdf .markdown-body img, .prd-pdf .markdown-body svg { max-width: 100%; height: auto; }
      .prd-pdf .pdf-footer {
        margin-top: 24px; padding-top: 10px; border-top: 1px solid #d1d5db;
        font-family: ui-monospace, monospace; font-size: 8.5pt; color: #9ca3af; text-align: center;
      }
    </style>
    <div class="prd-pdf">
      <div class="pdf-cover">
        <h1>${escapeHtml(prd.title)}</h1>
        <div class="pdf-meta">PRODUCT REQUIREMENTS DOCUMENT &middot; ${escapeHtml(date)}</div>
        <div class="pdf-meta" style="margin-top:4px;">Generated with PRDly</div>
      </div>
      ${sectionsHtml}
      <div class="pdf-footer">Generated with PRDly</div>
    </div>
  `;
  document.body.appendChild(container);

  try {
    await inlineSvgAsImages(container);
    await html2pdf()
      .set({
        margin: 10,
        filename: `${slugify(prd.title)}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .save();
  } finally {
    container.remove();
  }
}

/** html2canvas can't render certain SVGs — swap them for data-URL <img>s. */
async function inlineSvgAsImages(root: HTMLElement): Promise<void> {
  const svgs = Array.from(root.querySelectorAll('svg'));
  await Promise.all(
    svgs.map(async (svg) => {
      try {
        // Ensure the svg has explicit dimensions for rasterization.
        if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const box = svg.getBoundingClientRect();
        if (box.width && !svg.getAttribute('width')) svg.setAttribute('width', String(box.width));
        if (box.height && !svg.getAttribute('height')) svg.setAttribute('height', String(box.height));
        const xml = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.src = await rasterize(url, box.width || 800, box.height || 600);
        URL.revokeObjectURL(url);
        img.style.maxWidth = '100%';
        svg.replaceWith(img);
      } catch {
        // Leave the svg in place — html2canvas may still handle simple ones.
      }
    })
  );
}

/** Rasterize svg blob URL to png data URL (most compatible path for html2canvas). */
function rasterize(url: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no 2d context'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'prd';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
