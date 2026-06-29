import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Availability from "@/examples/availability";
import Meet from "@/examples/meet";
import Live from "@/examples/live";
import Gym from "@/examples/gym";

// Bare, chrome-free renders of the featured examples, used inside the landing gallery's preview
// iframes (NavHeader hides itself on /embed; there's no session sidebar here). Same live component
// as the real page, so the preview IS the example. Kept out of search: these are duplicate,
// chrome-free copies of the real demo pages.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const EMBEDDABLE: Record<string, ComponentType> = {
  availability: Availability,
  meet: Meet,
  live: Live,
  // Pinned to the public view: the embeddable widget must never expose the staff toggle.
  gym: () => <Gym publicOnly />,
};

export default async function EmbedPage({ params }: { params: Promise<{ example: string }> }) {
  const { example } = await params;
  const Example = EMBEDDABLE[example];
  if (!Example || !isExampleEnabled(example)) notFound();
  return <Example />;
}
