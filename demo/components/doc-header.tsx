import { docsSectionOf } from "@/lib/docs-nav";

// The page header shared by every docs page: the sidebar section the page sits in, and the title.
// The page passes its own path (it already has it for its metadata), so the section is read from
// the docs tree on the server, with no client code; moving a page in the tree relabels it here.
export function DocHeader({ title, path }: { title: string; path: string }) {
  return (
    <header className="mb-8">
      <div className="text-[13px] font-medium text-dt-accent-ink">{docsSectionOf(path)}</div>
      <h1 className="mt-2 text-balance text-[2rem] font-semibold leading-[1.15] tracking-[-0.025em] text-dt-ink sm:text-[2.4rem]">{title}</h1>
    </header>
  );
}
