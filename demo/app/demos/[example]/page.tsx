import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import { isExampleEnabled, enabledExampleIds } from "@/examples/config";
import Airline from "@/examples/airline";
import Theater from "@/examples/theater";
import Cinema from "@/examples/cinema";
import Stadium from "@/examples/stadium";
import Hotel from "@/examples/hotel";
import Restaurant from "@/examples/restaurant";
import Parking from "@/examples/parking";
import Availability from "@/examples/availability";
import Meet from "@/examples/meet";
import Live from "@/examples/live";
import Rules from "@/examples/rules";
import Builder from "@/examples/builder";
import Explainer from "@/examples/explainer";

// One route for every example, keyed by id, replacing the per-example page shims. The same live
// component renders here as before; only the routing boilerplate is shared.
const COMPONENTS: Record<string, ComponentType> = {
  airline: Airline,
  theater: Theater,
  cinema: Cinema,
  stadium: Stadium,
  hotel: Hotel,
  restaurant: Restaurant,
  parking: Parking,
  availability: Availability,
  meet: Meet,
  live: Live,
  rules: Rules,
  builder: Builder,
  explainer: Explainer,
};

export function generateStaticParams() {
  return enabledExampleIds().map((example) => ({ example }));
}

export default async function DemoPage({ params }: { params: Promise<{ example: string }> }) {
  const { example } = await params;
  const Example = COMPONENTS[example];
  if (!Example || !isExampleEnabled(example)) notFound();
  return <Example />;
}
