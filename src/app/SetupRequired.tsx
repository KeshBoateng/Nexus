export function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <img src="/icon.svg" alt="" className="mb-8 size-10" />
      <h1 className="text-[28px] font-semibold tracking-tight">Connect NEXUS to Supabase</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        NEXUS stores your data in your own Supabase project. Create a <code className="text-text">.env.local</code> file
        from <code className="text-text">.env.example</code>, add your project URL and publishable key, apply the
        migrations in <code className="text-text">supabase/migrations</code>, then restart the dev server.
      </p>
      <p className="mt-3 text-[15px] text-text-muted">
        Full steps: <code className="text-text">docs/SETUP.md</code>.
      </p>
    </main>
  );
}
