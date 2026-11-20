/**
 * Study Library helpers (pure, tested). Organisation is deterministic: a material is filed under
 * a course only when that course's code clearly appears in its name or text.
 */

const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Course codes like "DCIT 201", "DCIT-201", "DCIT201" → "DCIT201".
 * In body text codes must be capitalised (so "not 2026" isn't a code); file names may be any case.
 * Underscores count as separators ("dcit201_lecture3").
 */
export function codesIn(text: string, anyCase = false): Set<string> {
  const out = new Set<string>();
  const re = anyCase ? /(?<![A-Za-z])([A-Za-z]{2,5})[\s_-]?(\d{3,4})(?!\d)/g : /(?<![A-Za-z])([A-Z]{2,5})[\s_-]?(\d{3,4})(?!\d)/g;
  for (const m of text.matchAll(re)) out.add(`${m[1]!.toUpperCase()}${m[2]}`);
  return out;
}

/**
 * Best course for a file: a code in the file name wins; otherwise the code mentioned most in
 * the first part of the text (at least twice, to avoid a stray reference). Null if unsure.
 */
export function matchCourse(fileName: string, text: string, courses: readonly { id: string; code: string | null }[]): string | null {
  const known = courses.filter((c) => c.code).map((c) => ({ id: c.id, code: normCode(c.code!) }));
  if (!known.length) return null;
  const inName = codesIn(fileName, true);
  const byName = known.find((c) => inName.has(c.code));
  if (byName) return byName.id;
  const head = text.slice(0, 8000);
  let best: { id: string; n: number } | null = null;
  for (const c of known) {
    const letters = c.code.replace(/\d+$/, '');
    const digits = c.code.slice(letters.length);
    const re = new RegExp(`(?<![A-Za-z])${letters}[\\s_-]?${digits}(?!\\d)`, 'g');
    const n = (head.match(re) ?? []).length;
    if (n >= 2 && (!best || n > best.n)) best = { id: c.id, n };
  }
  return best?.id ?? null;
}

/** File name → readable title. */
export function titleFromFile(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'Untitled').slice(0, 200);
}

/** A short topic guess: the first meaningful line of the text, else the title. */
export function guessTopic(text: string, title: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 4 && l.length <= 90 && /[A-Za-z]{3}/.test(l) && !/^(page|slide)\s*\d+$/i.test(l) && !/^\d+$/.test(l));
  return (line ?? title).slice(0, 120);
}

/** Collapse whitespace noise from extraction while keeping paragraph breaks. */
export function cleanText(raw: string): string {
  return raw
    .replaceAll(String.fromCharCode(0), '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split text into chunks of ≤ max chars, preferring paragraph boundaries. */
export function chunkText(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/\n{2,}/)) {
    if ((cur + '\n\n' + para).length <= max) {
      cur = cur ? `${cur}\n\n${para}` : para;
      continue;
    }
    if (cur) out.push(cur);
    if (para.length <= max) cur = para;
    else {
      for (let i = 0; i < para.length; i += max) out.push(para.slice(i, i + max));
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const ACCEPTED: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
};

export function extOf(name: string): string | null {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  const ext = m?.[1]?.toLowerCase() ?? null;
  return ext && ext in ACCEPTED ? ext : null;
}
