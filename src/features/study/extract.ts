/**
 * Text extraction on the user's device. Libraries are loaded only when needed (Study Library
 * page), so the rest of the app stays small. Scanned PDFs (images only) yield no text — they
 * are stored and marked `no_text`, never guessed at.
 */
import { cleanText } from '../../lib/studyText';

const MAX_CHARS = 1_500_000;

export interface Extracted {
  text: string;
  pages: number | null;
}

async function pdf(buf: ArrayBuffer): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  const parts: string[] = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages && total < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('');
    parts.push(line);
    total += line.length;
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: parts.join('\n\n'), pages };
}

async function docx(buf: ArrayBuffer): Promise<Extracted> {
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return { text: r.value, pages: null };
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
  return { text: parts.join('\n\n'), pages: slides.length };
}

export async function extractText(file: File, ext: string): Promise<Extracted> {
  const buf = await file.arrayBuffer();
  let out: Extracted;
  if (ext === 'pdf') out = await pdf(buf);
  else if (ext === 'docx') out = await docx(buf);
  else if (ext === 'pptx') out = await pptx(buf);
  else out = { text: new TextDecoder().decode(buf), pages: null };
  return { text: cleanText(out.text).slice(0, MAX_CHARS), pages: out.pages };
}
