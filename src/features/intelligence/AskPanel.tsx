import { useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button, Notice, Panel } from '../../components/ui';
import { requireSupabase } from '../../lib/supabase';
import type { AiCategory } from '../../lib/aiContext';
import { todayIn } from '../../lib/dates';
import { useProfile } from '../profile/ProfileProvider';
import { buildSummaries } from './summaries';

type Msg = { role: 'user' | 'assistant'; content: string };

/**
 * Conversation is kept in memory only — it is not saved anywhere. If the AI fails, nothing
 * else in NEXUS is affected (spec §18.11).
 */
export function AskPanel({ permissions }: { permissions: Record<AiCategory, boolean> }) {
  const { profile, preferences } = useProfile();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<string[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  if (!preferences?.ai_enabled) return null;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user' as const, content: text }].slice(-20);
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const today = todayIn(profile?.timezone ?? 'Africa/Accra');
      const summaries = await buildSummaries(permissions, today, profile?.default_currency ?? 'GHS');
      const { data, error } = await requireSupabase().functions.invoke('ai-chat', { body: { messages: next, summaries, today } });
      if (error) {
        let msg = 'The assistant is unavailable right now.';
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) msg = body.error;
        } catch {
          /* keep generic message */
        }
        throw new Error(msg);
      }
      setMessages([...next, { role: 'assistant', content: String(data.reply ?? '') }]);
      setShared(data.shared ?? []);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Ask NEXUS">
      {messages.length === 0 && (
        <p className="mb-3 text-[15px] text-text-muted">
          Ask about your week, a decision, how to lead your group, or what to learn next. NEXUS answers from the data you allow below — and says when it
          doesn’t know.
        </p>
      )}
      <div className="mb-3 max-h-[28rem] space-y-3 overflow-y-auto" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[15px] ${m.role === 'user' ? 'ml-8 bg-surface-raised' : 'mr-4 border border-border'}`}
          >
            {m.content}
          </div>
        ))}
        {busy && <p className="text-sm text-text-faint">Thinking…</p>}
        <div ref={endRef} />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <form onSubmit={send} className="mt-2 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(e as unknown as FormEvent);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="What should I focus on this week?"
          aria-label="Message"
          className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
      <p className="mt-2 text-xs text-text-faint">
        {shared ? `Shared with the AI for the last answer: ${shared.length ? shared.join(', ') : 'nothing personal'}. ` : ''}
        Conversations aren’t saved. AI can be wrong — check anything important; money and legal questions get general information only.
      </p>
    </Panel>
  );
}
