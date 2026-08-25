import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isExampleEnabled, enabledExampleIds } from "@open-deltat/examples/config";
import { enabledExamples } from "@open-deltat/examples/manifest";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata, webPageLd, breadcrumbLd } from "@/lib/seo";
import Airline from "@open-deltat/examples/airline";
import Theater from "@open-deltat/examples/theater";
import Cinema from "@open-deltat/examples/cinema";
import Stadium from "@open-deltat/examples/stadium";
import Hotel from "@open-deltat/examples/hotel";
import Restaurant from "@open-deltat/examples/restaurant";
import Parking from "@open-deltat/examples/parking";
import Availability from "@open-deltat/examples/availability";
import Meet from "@open-deltat/examples/meet";
import Live from "@open-deltat/examples/live";
import Builder from "@open-deltat/examples/builder";

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
  builder: Builder,
};

export function generateStaticParams() {
  return enabledExampleIds().map((example) => ({ example }));
}

function demoSeo(label: string, tagline: string, example: string) {
  return {
    title: `${label}: a live demo`,
    description: `${tagline}. An interactive demo running live on Δt, the open database for time.`,
    path: `/demos/${example}`,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ example: string }> }): Promise<Metadata> {
  const { example } = await params;
  const meta = enabledExamples().find((e) => e.id === example);
  if (!meta) return {};
  return pageMetadata({ ...demoSeo(meta.label, meta.tagline, example), ogType: "article" });
}

export default async function DemoPage({ params }: { params: Promise<{ example: string }> }) {
  const { example } = await params;
  const Example = COMPONENTS[example];
  if (!Example || !isExampleEnabled(example)) notFound();
  const meta = enabledExamples().find((e) => e.id === example);
  const seo = meta ? demoSeo(meta.label, meta.tagline, example) : null;
  return (
    <>
      {seo && meta && (
        <JsonLd
          graph={[
            webPageLd(seo),
            breadcrumbLd([
              { name: "Home", path: "/" },
              { name: meta.label, path: `/demos/${example}` },
            ]),
          ]}
        />
      )}
      <Example />
    </>
  );
}
