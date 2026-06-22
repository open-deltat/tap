import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Availability from "@/examples/availability";
import Meet from "@/examples/meet";
import Rules from "@/examples/rules";
import Live from "@/examples/live";

// Bare, chrome-free renders of the featured examples, used inside the landing gallery's preview
// iframes (NavHeader hides itself on /embed; there's no session sidebar here). Same live component
// as the real page, so the preview IS the example.
const EMBEDDABLE: Record<string, ComponentType> = {
  availability: Availability,
  meet: Meet,
  rules: Rules,
  live: Live,
};

export default async function EmbedPage({ params }: { params: Promise<{ example: string }> }) {
  const { example } = await params;
  const Example = EMBEDDABLE[example];
  if (!Example || !isExampleEnabled(example)) notFound();
  return <Example />;
}
