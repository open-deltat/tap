import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { pageMetadata, SITE } from "@/lib/seo";
import { EMAIL_HREF } from "@/lib/contact";

export const metadata = pageMetadata({
  title: "Impressum",
  description: "Legal notice (Impressum) for delt.at under § 5 DDG: Kardashev Catalyst UG (haftungsbeschränkt), Köln, Germany.",
  path: "/impressum",
});

// The same company and wording as the nisd2.eu Impressum, so the two legal notices never disagree.
// The EU online dispute resolution link is left out: the platform closed on 20 July 2025.
const COMPANY = {
  name: "Kardashev Catalyst UG (haftungsbeschränkt)",
  address: "Trierer Str. 6, 50676 Köln, Germany",
  representative: "Simon Orzel",
  register: "Amtsgericht Köln, HRB 126993",
  euid: "DER3306.HRB126993",
} as const;

export default function ImpressumPage() {
  return (
    <div className="dt-canvas h-full overflow-auto text-dt-ink">
      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-6 sm:py-24">
        <h1 className="text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[2.8rem]">Impressum</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-dt-ink-2">Legal notice under § 5 DDG (Digitale-Dienste-Gesetz).</p>

        <Block title="Information under § 5 DDG">
          <address className="not-italic">
            <span className="block font-medium text-dt-ink">{COMPANY.name}</span>
            <span className="block">{COMPANY.address}</span>
            <span className="block">Represented by: {COMPANY.representative} (Geschäftsführer)</span>
            <span className="block">{COMPANY.register}</span>
            <span className="block">EUID: {COMPANY.euid}</span>
            <span className="block">
              Email:{" "}
              <a href={EMAIL_HREF} className="text-dt-ink underline decoration-dt-line-strong underline-offset-4 hover:decoration-dt-ink">
                {SITE.email}
              </a>
            </span>
          </address>
        </Block>

        <Block title="Responsible for content under § 18(2) MStV">
          <address className="not-italic">
            <span className="block font-medium text-dt-ink">{COMPANY.representative}</span>
            <span className="block">{COMPANY.address}</span>
          </address>
        </Block>

        <Block title="Consumer dispute resolution">
          <p>We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>
        </Block>

        <Block title="Liability for content">
          <p>
            As a service provider, we are responsible for our own content on these pages under general law, pursuant to § 7(1) DDG.
            Under §§ 8 to 10 DDG, however, we are not obliged to monitor transmitted or stored third-party information or to
            investigate circumstances that indicate illegal activity.
          </p>
          <p>
            Obligations to remove or block the use of information under general law remain unaffected. Liability in this regard is
            only possible from the time we learn of a specific legal violation. When we learn of such a violation, we remove the
            content immediately.
          </p>
        </Block>

        <Block title="Liability for links">
          <p>
            This site links to external websites whose content we do not control, so we cannot accept liability for it. The provider
            or operator of a linked page is always responsible for its content.
          </p>
          <p>
            Linked pages were checked for possible legal violations when the link was made, and none were apparent. Permanent checks of
            linked pages are unreasonable without concrete evidence of a violation. When we learn of one, we remove the link
            immediately.
          </p>
        </Block>

        <Block title="Copyright">
          <p>
            The code behind this site and Δt itself is open source. The licence in each repository on{" "}
            <a href={SITE.github} target="_blank" rel="noreferrer" className="text-dt-ink underline decoration-dt-line-strong underline-offset-4 hover:decoration-dt-ink">
              GitHub
            </a>{" "}
            says what you may do with it.
          </p>
          <p>
            Everything else the operators created on these pages is subject to German copyright law. Copying, editing, distributing or
            any use beyond the limits of copyright law needs the written consent of the author. Where content was not created by the
            operator, third-party copyrights are respected and marked as such. If you nevertheless notice a copyright infringement,
            please tell us and we will remove the content immediately.
          </p>
        </Block>
      </main>
      <SiteFooter />
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 border-t border-dt-line pt-6">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-dt-ink-2">{children}</div>
    </section>
  );
}
