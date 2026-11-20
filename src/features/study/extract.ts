/**
 * Text extraction on the user's device. Libraries are loaded only when needed (Study Library
 * page), so the rest of the app stays small. Scanned PDFs (images only) yield no text — they
 * are stored and marked `no_text`, never guessed at.
 *
 * For PDFs and slide decks we also record where each page/slide starts in the text, so Learn
 * mode can say "Section 4 · pages 22–28" exactly.
 */
import { cleanText } from '../../lib/studyText';

const MAX_CHARS = 1_500_000;
const SEP = '\n\n';

export interface Extracted {
  text: string;
  pages: number | null;
  /** Char offset where each page/slide starts in `text` (null for formats without pages). */
  pageStarts: number[] | null;
}

/** Clean each page separately and join, remembering where every page starts. */
function joinPages(pages: string[]): { text: string; pageStarts: number[] } {
  const parts: string[] = [];
  const pageStarts: number[] = [];
  let pos = 0;
  for (const raw of pages) {
    const t = cleanText(raw);
    pageStarts.push(pos);
    parts.push(t);
    pos += t.length + SEP.length;
  }
  return { text: parts.join(SEP), pageStarts };
}

async function pdf(buf: ArrayBuffer): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  const pages: string[] = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages && total < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('');
    pages.push(line);
    total += line.length;
  }
  const count = doc.numPages;
  await task.destroy();
  return { ...joinPages(pages), pages: count };
}

async function docx(buf: ArrayBuffer): Promise<Extracted> {
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return { text: cleanText(r.value), pages: null, pageStarts: null };
}

async function pptx(buf: ArrayBuffer): Promise<Extracted> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  const parts: string[] = [];
  for (const m of slides) {
    const xml = await zip.file(m[0])!.async('string');
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => x[1]!);
    const decoded = runs.join(' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    parts.push(`Slide ${m[1]}\n${decoded}`);
  }
  return { ...joinPages(parts), pages: slides.length };
}

export async function extractText(file: File, ext: string): Promise<Extracted> {
  const buf = await file.arrayBuffer();
  let out: Extracted;
  if (ext === 'pdf') out = await pdf(buf);
  else if (ext === 'docx') out = await docx(buf);
  else if (ext === 'pptx') out = await pptx(buf);
  else out = { text: cleanText(new TextDecoder().decode(buf)), pages: null, pageStarts: null };
  // Pages are cleaned individually, so offsets stay valid; truncation drops pages past the cap.
  const text = out.text.slice(0, MAX_CHARS);
  return { text, pages: out.pages, pageStarts: out.pageStarts ? out.pageStarts.filter((o) => o < text.length) : null };
}
