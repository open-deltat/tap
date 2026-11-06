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
    // Flat canvas: the iframe below is flat too, so the light from above would end in a seam.
    <div className="h-full overflow-auto bg-dt-canvas text-dt-ink">
      <JsonLd
        graph={[
          webPageLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Embedded schedule", path: "/demos/gym" },
          ]),
        ]}
      />
      {/* The same header every example has, so this page reads as one of them. */}
      <header className="w-full px-5 pb-1 pt-8 text-center sm:pt-12">
        <h1 className="text-balance text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-dt-ink sm:text-[2rem]">FitFlow Studio</h1>
        <p className="mx-auto mt-2 flex max-w-md flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-dt-ink-3">
          <span className="text-balance">A schedule you can put on any website</span>
          <span className="rounded-full border border-dt-line px-2 py-px font-mono text-[10.5px] text-dt-ink-3">EDGE-03</span>
        </p>
      </header>

      {/* The real widget in a real iframe. No frame of its own: the widget already brings its card,
          so it sits on the page exactly like every other example. */}
      <iframe src="/embed/gym" width="100%" height={EMBED_HEIGHT} style={{ border: 0 }} loading="lazy" title="Class schedule" className="block" />

      <div className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
        <EmbedSnippet example="gym" height={EMBED_HEIGHT} />
      </div>
    </div>
  );
}
