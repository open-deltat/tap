import Link from "next/link";
import type { DisplayProfile } from "@open-deltat/examples/lib/auth-session";

// The signed-in marker in the nav: a small round avatar (picture if the provider gave one, else the
// initial), linking to the dashboard. Presence of this element is itself the "you are logged in"
// signal, the way a chat app shows your avatar top-right.
export function ProfileAvatar({ profile }: { profile: DisplayProfile }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Your dashboard"
      className="ml-1 inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-foreground text-xs font-medium text-background ring-1 ring-border transition-opacity hover:opacity-90"
    >
      {profile.picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.picture} alt="" className="h-full w-full object-cover" />
      ) : (
        profile.initial
      )}
    </Link>
  );
}
