import type { ReactNode } from "react";
import type { Metadata } from "next";
import { DocsSidebar } from "@/components/docs-sidebar";
import { SiteFooter } from "@/components/site-footer";
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
    <div className="dt-canvas relative h-full overflow-auto text-dt-ink">
      <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:flex-row sm:gap-12 sm:px-6 sm:py-12">
        <DocsSidebar />
        <main className="min-w-0 flex-1 pb-20">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
