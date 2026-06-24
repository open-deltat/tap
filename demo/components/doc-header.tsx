// The page header shared by every docs page: a section eyebrow and the page title.
export function DocHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-6">
      <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/70">{eyebrow}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
    </header>
  );
}
