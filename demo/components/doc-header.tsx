// The page header shared by every docs page: a section eyebrow and the page title.
export function DocHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-8">
      <div className="text-[13px] font-medium text-dt-accent-ink">{eyebrow}</div>
      <h1 className="mt-2 text-balance text-[2rem] font-semibold leading-[1.15] tracking-[-0.025em] text-dt-ink sm:text-[2.4rem]">{title}</h1>
    </header>
  );
}
