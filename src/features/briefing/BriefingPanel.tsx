import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Notice, Panel } from '../../components/ui';
import { useRunner, type Run } from '../../lib/useRunner';
import { act, rate, useBriefing, type Rating, type Rec } from './api';

const RATINGS: { value: Rating; label: string }[] = [
  { value: 'very_useful', label: 'Very useful' },
  { value: 'somewhat_useful', label: 'Somewhat' },
  { value: 'not_useful', label: 'Not useful' },
  { value: 'already_know', label: 'Already know' },
];

const STATUS_LABEL: Record<Rec['status'], string> = {
  open: '',
  accepted: 'Accepted',
  started: 'Started',
  completed: 'Done',
  applied: 'Applied',
  dismissed: 'Not now',
};

export function BriefingPanel({ today, currency }: { today: string; currency: string }) {
  const { data, error, reload, refresh } = useBriefing(today, currency);
  const { run, error: actionError, busy } = useRunner(reload);

  return (
    <Panel
      title="Today's briefing"
      action={
        <button
          className="rounded-lg p-1.5 text-text-faint hover:text-text disabled:opacity-40"
          onClick={() => run(refresh)}
          disabled={busy}
          aria-label="Refresh briefing"
          title="Re-check your records"
        >
          <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {actionError && <Notice tone="danger">{actionError}</Notice>}
      {!data && !error && <p className="text-[15px] text-text-muted">Reviewing your records…</p>}
      {data && data.items.length === 0 && <p className="text-[15px] text-text-muted">Nothing needs you right now. Good place to be.</p>}
      <ul className="space-y-3">
        {data?.items.map((r) => (
          <RecCard key={r.id} rec={r} rating={data.ratings.get(r.id)} run={run} />
        ))}
      </ul>
      {data && data.items.length > 0 && <p className="mt-3 text-xs text-text-faint">Built from your recorded data by fixed rules — no AI involved.</p>}
    </Panel>
  );
}

export function RecCard({ rec, rating, run }: { rec: Rec; rating?: Rating; run: Run }) {
  const [open, setOpen] = useState(false);
  const [askReason, setAskReason] = useState<Rating | null>(null);
  const [reason, setReason] = useState('');
  const closed = rec.status === 'completed' || rec.status === 'applied' || rec.status === 'dismissed';
  const dot = rec.priority >= 75 ? 'bg-danger' : rec.priority >= 50 ? 'bg-accent' : 'bg-text-faint';
  const appliable = rec.status === 'completed' && (rec.kind === 'developmental' || rec.category === 'leadership');

  return (
    <li className={`rounded-xl border border-border p-4 ${closed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} aria-label={`priority ${rec.priority}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[15px] font-medium ${rec.status === 'dismissed' ? 'line-through' : ''}`}>{rec.title}</p>
            {STATUS_LABEL[rec.status] && <span className="shrink-0 text-xs text-text-faint">{STATUS_LABEL[rec.status]}</span>}
          </div>
          <p className="mt-1 text-sm text-text-muted">{rec.action}</p>
          <button className="mt-1.5 text-xs text-text-faint hover:text-text" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Hide why' : 'Why?'}
            {rec.est_minutes ? ` · ~${rec.est_minutes} min` : ''} · {rec.category}
            {rec.essential ? ' · essential' : ''}
          </button>
          {open && (
            <div className="mt-2 space-y-1 text-sm text-text-muted">
              <p>{rec.why}</p>
              {rec.benefit && <p className="text-text-faint">Benefit: {rec.benefit}</p>}
              <ul className="list-disc pl-5 text-xs text-text-faint">
                {rec.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {!closed && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent" onClick={() => run(() => act(rec, 'completed'))}>
                Done
              </button>
              {rec.status === 'open' && (
                <button className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-text" onClick={() => run(() => act(rec, 'started'))}>
                  On it
                </button>
              )}
              <button className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-text" onClick={() => run(() => act(rec, 'dismissed'))}>
                Not now
              </button>
            </div>
          )}
          {appliable && (
            <button className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent" onClick={() => run(() => act(rec, 'applied'))}>
              I applied this — it worked
            </button>
          )}

          {rating ? (
            <p className="mt-3 text-xs text-text-faint">You rated this: {RATINGS.find((x) => x.value === rating)?.label}</p>
          ) : askReason ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run(() => rate(rec, askReason, reason))) setAskReason(null);
              }}
            >
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Why? (optional)"
                aria-label="Reason"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm focus:border-accent focus:outline-none"
              />
              <button className="rounded-lg bg-accent px-3 text-xs font-medium text-on-accent">Send</button>
            </form>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Rate this recommendation">
              {RATINGS.map((x) => (
                <button
                  key={x.value}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-text-muted hover:border-accent hover:text-text"
                  onClick={() => (x.value === 'not_useful' ? setAskReason(x.value) : run(() => rate(rec, x.value, null)))}
                >
                  {x.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
