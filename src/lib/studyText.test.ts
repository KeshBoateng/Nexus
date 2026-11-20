import { describe, expect, it } from 'vitest';
import { chunkText, cleanText, codesIn, extOf, guessTopic, matchCourse, titleFromFile } from './studyText';

const courses = [
  { id: 'c1', code: 'DCIT 201' },
  { id: 'c2', code: 'MATH223' },
  { id: 'c3', code: null },
];

describe('course matching', () => {
  it('finds codes in many spellings', () => {
    expect([...codesIn('DCIT 201, DCIT-202 and MATH_223 but not 2026 or CS1 or dcit 205')]).toEqual(['DCIT201', 'DCIT202', 'MATH223']);
    expect([...codesIn('dcit201_lecture3', true)]).toEqual(['DCIT201']);
  });
  it('prefers a code in the file name', () => {
    expect(matchCourse('dcit201_lecture3.pdf', 'MATH 223 MATH 223 MATH 223', courses)).toBe('c1');
  });
  it('uses the text only when the code appears at least twice', () => {
    expect(matchCourse('lecture3.pdf', 'Course: MATH 223. Week 3 of MATH223.', courses)).toBe('c2');
    expect(matchCourse('lecture3.pdf', 'See also MATH 223 for details.', courses)).toBeNull();
  });
  it('returns null with no coded courses', () => {
    expect(matchCourse('DCIT201.pdf', '', [{ id: 'x', code: null }])).toBeNull();
  });
});

describe('titles, topics, cleaning', () => {
  it('builds readable titles', () => {
    expect(titleFromFile('DCIT201_Lecture_3__Recursion.pdf')).toBe('DCIT201 Lecture 3 Recursion');
  });
  it('guesses a topic from the first meaningful line', () => {
    expect(guessTopic('1\nPage 1\nIntroduction to Recursion\nBody text', 'T')).toBe('Introduction to Recursion');
    expect(guessTopic('', 'Fallback title')).toBe('Fallback title');
  });
  it('cleans extraction noise but keeps paragraphs', () => {
    expect(cleanText('A   b\t c\n\n\n\nNext  para \n line')).toBe('A b c\n\nNext para\nline');
  });
});

describe('chunkText', () => {
  it('keeps paragraphs together and splits oversized ones', () => {
    const t = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(130)].join('\n\n');
    const chunks = chunkText(t, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks[0]).toBe(`${'a'.repeat(40)}\n\n${'b'.repeat(40)}`);
    expect(chunks.join('').replace(/\n/g, '').length).toBe(210);
  });
});

describe('extOf', () => {
  it('accepts supported document types only', () => {
    expect(extOf('notes.PDF')).toBe('pdf');
    expect(extOf('slides.pptx')).toBe('pptx');
    expect(extOf('virus.exe')).toBeNull();
    expect(extOf('noext')).toBeNull();
  });
});

describe('sectionsFor', () => {
  it('follows page boundaries with exact page numbers', async () => {
    const { sectionsFor, sectionLabel } = await import('./studyText');
    // 10 pages of 1000 chars each → sections of ≥ 3000 chars → pages 1–3, 4–6, 7–9, 10
    const page = 'x'.repeat(998) + '\n\n';
    const text = page.repeat(10);
    const starts = Array.from({ length: 10 }, (_, i) => i * 1000);
    const s = sectionsFor(text, starts, 10, 3000);
    expect(s.map((x) => [x.fromPage, x.toPage])).toEqual([[1, 3], [4, 6], [7, 9], [10, 10]]);
    expect(s.every((x) => !x.approximate)).toBe(true);
    expect(s[s.length - 1]!.end).toBe(text.length);
    expect(sectionLabel(s[0]!)).toBe('Section 1 · pages 1–3');
    expect(sectionLabel(s[3]!)).toBe('Section 4 · page 10');
  });

  it('covers the whole text without a page map, estimating pages', async () => {
    const { sectionsFor, sectionLabel } = await import('./studyText');
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ` + 'y'.repeat(480)).join('\n\n');
    const s = sectionsFor(text, null, 82, 6000);
    expect(s[0]!.start).toBe(0);
    expect(s[s.length - 1]!.end).toBe(text.length);
    for (let i = 1; i < s.length; i++) expect(s[i]!.start).toBe(s[i - 1]!.end); // contiguous, no gaps
    expect(s.every((x) => x.approximate && x.fromPage! >= 1 && x.toPage! <= 82)).toBe(true);
    expect(sectionLabel(s[0]!)).toMatch(/^Section 1 · ≈ pages 1–\d+$/);
  });

  it('is deterministic', async () => {
    const { sectionsFor } = await import('./studyText');
    const text = 'a'.repeat(20000);
    expect(sectionsFor(text, null, null, 6000)).toEqual(sectionsFor(text, null, null, 6000));
  });
});
