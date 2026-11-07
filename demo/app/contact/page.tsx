import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { pageMetadata, SITE } from "@/lib/seo";
import { EMAIL_HREF, PILOT_MAILTO, ENTERPRISE_MAILTO } from "@/lib/contact";

export const metadata = pageMetadata({
  title: "Contact",
  description:
    "Email Simon Orzel, who wrote Δt, about a founding pilot, an enterprise licence or anything else. Bugs and code questions go to GitHub.",
  path: "/contact",
});

const REASONS = [
  { label: "Start a founding pilot", detail: "Hosted Δt in the EU, wired into your agent.", href: PILOT_MAILTO },
  { label: "Enterprise or a commercial licence", detail: "Closed-source products, many calendars, your own deployment.", href: ENTERPRISE_MAILTO },
  { label: "A bug or a code question", detail: "Open an issue on GitHub so the answer helps the next person too.", href: `${SITE.deltatRepo}/issues`, external: true },
] as const;

export default function ContactPage() {
  return (
    <div className="dt-canvas h-full overflow-auto text-dt-ink">
      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-6 sm:py-24">
        <h1 className="text-balance text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[2.8rem]">Contact</h1>
        <p className="mt-4 text-pretty text-[16px] leading-relaxed text-dt-ink-2">
          Email reaches Simon Orzel, who wrote Δt.
        </p>
        <a
          href={EMAIL_HREF}
          className="mt-8 inline-block text-[1.5rem] font-semibold tracking-[-0.02em] text-dt-ink underline decoration-dt-line-strong underline-offset-[6px] transition-colors hover:decoration-dt-ink sm:text-[1.9rem]"
        >
          {SITE.email}
        </a>

        <ul className="mt-14 border-t border-dt-line">
          {REASONS.map((r) => (
            <li key={r.label} className="border-b border-dt-line">
              <a
                href={r.href}
                {...("external" in r ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group flex min-h-16 items-center justify-between gap-4 py-4"
              >
                <span>
                  <span className="block text-[15px] font-medium text-dt-ink">{r.label}</span>
                  <span className="mt-0.5 block text-[13.5px] text-dt-ink-3">{r.detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-dt-ink-3 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-dt-ink" />
              </a>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
