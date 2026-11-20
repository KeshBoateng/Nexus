import { useState, type FormEvent } from 'react';
import { requireSupabase } from '../../lib/supabase';
import { Button, Field, Notice, TextInput } from '../../components/ui';
import { useAuth } from './AuthProvider';

export function NewPasswordPage() {
  const { clearRecovering } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError('Use at least 10 characters.');
    setBusy(true);
    const { error } = await requireSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else clearRecovering();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 animate-rise">
        <h1 className="mb-6 text-[28px] font-semibold tracking-tight">Choose a new password</h1>
        <Field label="New password" hint="At least 10 characters.">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </main>
  );
}
