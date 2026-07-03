"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/seo";

// A slim top bar on every page: the logo (back to the example gallery), a link to the
// docs, and the theme toggle. The example list lives on the landing gallery (/), not in a
// cramped row of links here.
export function NavHeader() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  // Embedded example previews (used inside the landing cards) render chrome-free.
  if (pathname?.startsWith("/embed")) return null;
  const onDocs = pathname.startsWith("/docs");
  const onGallery = pathname === "/";

  const link = (active: boolean) =>
    cn(
      "rounded-md px-2.5 py-1.5 text-xs transition-colors",
      active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
    );

  return (
    <header className="flex shrink-0 items-center justify-between border-b px-4 py-1.5">
      <a href="/" className="select-none text-sm font-semibold tracking-tight">
        Δt
      </a>

      <div className="flex items-center gap-1">
        <a href="/" className={link(onGallery)}>
          Examples
        </a>
        <a href="/docs" className={link(onDocs)}>
          Docs
        </a>
        <a
          href={SITE.github}
          target="_blank"
          rel="noreferrer"
          aria-label="open-deltat on GitHub"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Github className="h-4 w-4" />
        </a>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  );
}
