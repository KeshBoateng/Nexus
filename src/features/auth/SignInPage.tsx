import { useState, type FormEvent } from 'react';
import { requireSupabase } from '../../lib/supabase';
import { Button, Field, Notice, TextInput } from '../../components/ui';

type Mode = 'signin' | 'signup' | 'reset';

const MIN_PASSWORD = 10;

export function SignInPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const auth = requireSupabase().auth;
    try {
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
        const { data, error } = await auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        // Same message whether or not the account exists — avoids revealing registered emails.
        setInfo('If that email has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const title = { signin: 'Welcome back', signup: 'Create your NEXUS', reset: 'Reset password' }[mode];

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-10 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-9" />
          <span className="text-sm font-semibold tracking-[0.2em] text-text-muted">NEXUS</span>
        </div>
        <h1 className="mb-8 text-[28px] font-semibold tracking-tight">{title}</h1>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === 'signup' && (
            <Field label="What should NEXUS call you?">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="nickname" />
            </Field>
          )}
          <Field label="Email">
            <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          {mode !== 'reset' && (
            <Field label="Password" hint={mode === 'signup' ? `At least ${MIN_PASSWORD} characters.` : undefined}>
              <TextInput
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </Field>
          )}

          {error && <Notice tone="danger">{error}</Notice>}
          {info && <Notice tone="success">{info}</Notice>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Please wait…' : { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[mode]}
          </Button>
        </form>

        <div className="mt-6 flex flex-wrap justify-between gap-2 text-sm">
          {mode !== 'signin' ? (
            <button className="text-text-muted hover:text-text" onClick={() => setMode('signin')}>
              Back to sign in
            </button>
          ) : (
            <>
              <button className="text-text-muted hover:text-text" onClick={() => setMode('signup')}>
                Create an account
              </button>
              <button className="text-text-muted hover:text-text" onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
