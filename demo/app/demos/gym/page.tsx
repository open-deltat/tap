import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import { EmbedSnippet } from "@/components/embed-snippet";

// The gym demo IS the embed: the schedule below is the real /embed/gym widget loaded through an
// actual <iframe> — byte-for-byte the snippet you'd paste elsewhere — followed by that snippet to copy.
const EMBED_HEIGHT = 820;

export default function Page() {
  if (!isExampleEnabled("gym")) notFound();

  return (
    <div className="h-full overflow-auto bg-[#0a0a0c] text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-5">
          <div className="text-[10.5px] uppercase tracking-[0.2em] text-emerald-300/70">Live embed</div>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-400">
            The schedule below is the real{" "}
            <code className="rounded bg-white/[0.06] px-1 py-px font-mono text-[11px]">/embed/gym</code>{" "}
            widget loaded in an actual iframe — the read-only public view, exactly what visitors see.
            Copy the snippet underneath to drop it on any site.
          </p>
        </header>

        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
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
