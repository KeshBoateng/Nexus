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
