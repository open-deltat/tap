import { DeltatMark } from "@/components/deltat-mark";
import { SITE } from "@/lib/seo";

const LINKS = [
  { href: "/docs", label: "Docs" },
  { href: SITE.github, label: "GitHub", external: true },
  { href: "https://www.npmjs.com/package/@open-deltat/mcp", label: "npm", external: true },
  { href: "https://crates.io/crates/deltat", label: "crates.io", external: true },
  { href: "/llms.txt", label: "llms.txt" },
  { href: "/contact", label: "Contact" },
  { href: "/impressum", label: "Impressum" },
] as const;

// German law wants the Impressum one click from every page a visitor reads, so every scrolling page
// (landing, docs, contact, Impressum) ends in this footer. Demos are full-screen apps and skip it.
export function SiteFooter() {
  return (
    <footer className="border-t border-dt-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-[13px] text-dt-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <DeltatMark size="sm" />
          <span>{SITE.headline}</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          {LINKS.map((l) =>
            "external" in l ? (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="hover:text-dt-ink">
                {l.label}
              </a>
            ) : (
              <a key={l.href} href={l.href} className="hover:text-dt-ink">
                {l.label}
              </a>
            )
          )}
        </nav>
      </div>
    </footer>
  );
}
