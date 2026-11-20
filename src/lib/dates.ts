/** Date helpers for display. Storage is always ISO/timestamptz; these never feed calculations. */

const DAY = 86_400_000;

/** `<input type="datetime-local">` value (browser local time) → ISO string, or null when empty. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → value for `<input type="datetime-local">` in browser local time. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Overdue by 2 days", "Today 14:00", "Tomorrow", "In 5 days", or a date. */
export function describeDue(iso: string, now: Date = new Date(), timeZone = 'Africa/Accra'): { text: string; overdue: boolean; soon: boolean } {
  const due = new Date(iso);
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const dayDiff = Math.round((Date.parse(dayKey(due)) - Date.parse(dayKey(now))) / DAY);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(due);
  const overdue = due.getTime() < now.getTime();
  let text: string;
  if (overdue) text = dayDiff === 0 ? `Overdue · was due ${time}` : `Overdue by ${-dayDiff} day${dayDiff === -1 ? '' : 's'}`;
  else if (dayDiff === 0) text = `Today ${time}`;
  else if (dayDiff === 1) text = `Tomorrow ${time}`;
  else if (dayDiff < 7) text = `In ${dayDiff} days`;
  else text = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(due);
  return { text, overdue, soon: !overdue && dayDiff <= 3 };
}
