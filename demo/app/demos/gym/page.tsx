import { notFound } from "next/navigation";
import { isExampleEnabled } from "@open-deltat/examples/config";
import { EmbedSnippet } from "@/components/embed-snippet";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata, webPageLd, breadcrumbLd } from "@/lib/seo";

// The gym demo IS the embed: the schedule below is the real /embed/gym widget loaded through an
// actual <iframe>, byte-for-byte the snippet you'd paste elsewhere, followed by that snippet to copy.
const EMBED_HEIGHT = 820;

// This route is hand-rolled (not /demos/[example]) because it wraps the embed, so it carries the
// same SEO shape the shared demo route generates: without it the page falls back to the root
// layout's default title and duplicates the landing page in search.
const SEO = {
  title: "Embedded schedule: a live demo",
  description:
    "A read-only schedule you can embed. An interactive demo running live on Δt, the open database for time.",
  path: "/demos/gym",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function Page() {
  if (!isExampleEnabled("gym")) notFound();

  return (
    <div className="dt-canvas h-full overflow-auto text-dt-ink">
      <JsonLd
        graph={[
          webPageLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Embedded schedule", path: "/demos/gym" },
          ]),
        ]}
      />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-6 text-center">
          <h1 className="text-balance text-[1.6rem] font-semibold tracking-[-0.02em] text-dt-ink sm:text-[2rem]">Embedded schedule</h1>
          <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-dt-ink-3">
            The schedule below is the real{" "}
            <code className="rounded-md bg-dt-sunken px-1.5 py-0.5 font-mono text-[12px] text-dt-ink">/embed/gym</code>{" "}
            widget loaded in an actual iframe, the read-only public schedule that visitors see.
            Copy the snippet underneath to drop it on any site.
          </p>
        </header>

        <div className="overflow-hidden rounded-[28px] border border-dt-line bg-dt-surface shadow-dt-surface">
          <iframe
            src="/embed/gym"
            width="100%"
            height={EMBED_HEIGHT}
            style={{ border: 0, borderRadius: 12 }}
            loading="lazy"
            title="Class schedule"
            className="block"
          />
        </div>

        <EmbedSnippet className="mt-6" example="gym" height={EMBED_HEIGHT} />
      </div>
    </div>
  );
}
