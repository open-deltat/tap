import type { ReactNode } from "react";
import type { Metadata } from "next";
import { DocsSidebar } from "@/components/docs-sidebar";
import { TITLE_TEMPLATE } from "@/lib/seo";

// Defining a title here replaces the root layout's title object, template included, so the
// template must be re-stated or every docs page below would lose its brand suffix.
export const metadata: Metadata = {
  title: { default: "Docs", template: TITLE_TEMPLATE },
  description: "Δt is a database for time; TAP is how you use it. Data model, holds, the SDK, and self-hosting.",
};

// A static docs section that inherits the root layout (NavHeader + theme), with a two-group left rail.
// It deliberately does NOT live under /demos, so it never picks up the demo session chrome.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full overflow-auto bg-[#0a0a0c] text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle,#ffffff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:gap-10 sm:px-6">
        <DocsSidebar />
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
