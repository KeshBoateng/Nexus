import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/** Small set of primitives. Everything references semantic tokens from index.css. */

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';
  const styles = {
    primary: 'bg-accent text-on-accent hover:bg-accent-strong',
    ghost: 'text-text-muted hover:bg-surface-raised hover:text-text',
    danger: 'text-danger hover:bg-surface-raised',
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

const fieldClass =
  'h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-text-faint">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={fieldClass} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={fieldClass} {...props} />;
}

export function Panel({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({ tone = 'muted', children }: { tone?: 'muted' | 'danger' | 'success'; children: ReactNode }) {
  const color = { muted: 'text-text-muted', danger: 'text-danger', success: 'text-success' }[tone];
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={`text-sm ${color}`}>
      {children}
    </p>
  );
}
