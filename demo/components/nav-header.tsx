"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Github, Menu, X } from "lucide-react";
import type { DisplayProfile } from "@open-deltat/examples/lib/auth-session";
import { ProfileAvatar } from "@/components/profile-avatar";
import { DeltatMark } from "@/components/deltat-mark";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/seo";

const LINKS = [
  { href: "/#examples", label: "Examples", match: (p: string) => p.startsWith("/demos") },
  { href: "/docs", label: "Docs", match: (p: string) => p.startsWith("/docs") },
  { href: "/#pricing", label: "Pricing", match: () => false },
] as const;

const ICON_BTN =
  "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-dt-ink-2 transition-colors hover:bg-dt-sunken hover:text-dt-ink";

// One bar on every page. Desktop shows the three destinations inline; a phone keeps only the logo,
// the one call to action and a menu, because five controls in 390px is what made the old bar cramped.
export function NavHeader({
  authEnabled = false,
  profile = null,
}: {
  authEnabled?: boolean;
  profile?: DisplayProfile | null;
}) {
  const pathname = usePathname() ?? "/";
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  // Embedded example previews (used inside the landing cards) render chrome-free.
  if (pathname.startsWith("/embed")) return null;

  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  const signIn = authEnabled && !profile;

  return (
    <header className="relative z-40 shrink-0 border-b border-dt-line bg-dt-canvas/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Δt home" onClick={() => setOpen(false)} className="relative flex select-none items-center after:absolute after:-inset-1.5">
          <DeltatMark />
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13.5px] transition-colors",
                l.match(pathname) ? "bg-dt-sunken font-medium text-dt-ink" : "text-dt-ink-2 hover:text-dt-ink"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <a href={SITE.github} target="_blank" rel="noreferrer" aria-label="open-deltat on GitHub" className={cn(ICON_BTN, "hidden sm:inline-flex")}>
            <Github className="h-[17px] w-[17px]" />
          </a>
          <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className={cn(ICON_BTN, "hidden sm:inline-flex")}>
            <Sun className="h-[17px] w-[17px] dark:hidden" />
            <Moon className="hidden h-[17px] w-[17px] dark:block" />
          </button>
          {authEnabled && profile && <ProfileAvatar profile={profile} />}
          {signIn && (
            <Link href="/auth/login?returnTo=/dashboard" className="hidden rounded-full px-3 py-1.5 text-[13.5px] text-dt-ink-2 transition-colors hover:text-dt-ink sm:inline-flex">
              Sign in
            </Link>
          )}
          <Link
            href="/#pricing"
            onClick={() => setOpen(false)}
            className="ml-1 inline-flex h-10 items-center rounded-full bg-dt-ink sm:h-9 px-4 text-[13.5px] font-medium text-dt-on-ink transition-[background-color,transform] duration-150 hover:bg-dt-ink/85 active:scale-[0.97]"
          >
            Start a pilot
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className={cn(ICON_BTN, "h-11 w-11 sm:hidden")}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="dt-rise absolute inset-x-0 top-full border-b border-dt-line bg-dt-canvas px-4 pb-5 pt-2 shadow-dt-float sm:hidden">
          <nav aria-label="Main" className="flex flex-col">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center border-b border-dt-line text-[17px] font-medium text-dt-ink"
              >
                {l.label}
              </Link>
            ))}
            <a href={SITE.github} target="_blank" rel="noreferrer" className="flex h-12 items-center gap-2 border-b border-dt-line text-[17px] font-medium text-dt-ink">
              <Github className="h-[18px] w-[18px]" /> GitHub
            </a>
            {signIn && (
              <Link href="/auth/login?returnTo=/dashboard" onClick={() => setOpen(false)} className="flex h-12 items-center border-b border-dt-line text-[17px] font-medium text-dt-ink">
                Sign in
              </Link>
            )}
            <button type="button" onClick={toggleTheme} className="flex h-12 items-center gap-2 text-left text-[17px] font-medium text-dt-ink">
              <Sun className="h-[18px] w-[18px] dark:hidden" />
              <Moon className="hidden h-[18px] w-[18px] dark:block" />
              <span className="dark:hidden">Dark mode</span>
              <span className="hidden dark:inline">Light mode</span>
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
