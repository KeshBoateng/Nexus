import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import JSZip from 'jszip';
import { extractText } from './extract';

describe('extractText', () => {
  it('reads PowerPoint slides in order', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>Base case</a:t><a:t>stops recursion</a:t></p:sld>');
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>Recursion &amp; Stacks</a:t></p:sld>');
    zip.file('ppt/slides/slide10.xml', '<p:sld><a:t>Summary</a:t></p:sld>');
    const blob = await zip.generateAsync({ type: 'arraybuffer' });
    const r = await extractText(new File([blob], 'lec.pptx'), 'pptx');
    expect(r.pages).toBe(3);
    expect(r.text).toBe('Slide 1\nRecursion & Stacks\n\nSlide 2\nBase case stops recursion\n\nSlide 10\nSummary');
  });

  it('reads plain text and cleans it', async () => {
    const r = await extractText(new File(['Topic:   Graphs\n\n\n\nEdges  and nodes'], 'n.txt'), 'txt');
    expect(r.text).toBe('Topic: Graphs\n\nEdges and nodes');
  });
});

describe('StudyPack', () => {
  it('shows summary and concepts, flips flashcards, reveals answers on demand', async () => {
    const { StudyPack } = await import('./StudyLibraryPage');
    render(
      <StudyPack
        a={{
          material_id: '00000000-0000-4000-8000-000000000001',
          summary: 'Recursion solves a problem by solving smaller copies of it.',
          key_concepts: [{ term: 'Base case', explanation: 'The condition that stops recursion.' }],
          flashcards: [
            { q: 'What stops recursion?', a: 'A base case' },
            { q: 'What structure tracks calls?', a: 'The call stack' },
          ],
          questions: [{ q: 'Explain why factorial needs a base case.', a: 'Without it the calls never end.' }],
          created_at: '2026-11-20T00:00:00Z',
        }}
      />,
    );
    expect(screen.getByText(/smaller copies/)).toBeInTheDocument();
    expect(screen.getByText('Base case')).toBeInTheDocument();
    const card = screen.getByRole('button', { name: 'Flashcard: show answer' });
    expect(card).toHaveTextContent('What stops recursion?');
    fireEvent.click(card);
    expect(screen.getByRole('button', { name: 'Flashcard: show question' })).toHaveTextContent('A base case');
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('What structure tracks calls?')).toBeInTheDocument();
    expect(screen.queryByText('Without it the calls never end.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show answer'));
    expect(screen.getByText('Without it the calls never end.')).toBeInTheDocument();
  });
});
