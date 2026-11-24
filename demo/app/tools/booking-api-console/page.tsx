import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { HowItWorks } from "@/components/tools/how-it-works";
import { ApiConsole } from "@/components/tools/api-console";
import { CodeBlock } from "@/components/tools/code-block";
import { pageMetadata, webApplicationLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/tools/booking-api-console");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const INSTALL = `npm install @open-deltat/client`;

const CONNECT = `import { DeltaT } from "@open-deltat/client";

const dt = new DeltaT({ host: "localhost", port: 5433, password: process.env.DELTAT_PASSWORD });
const calendar = (await dt.resources.create({ name: "Room A" })).id;`;

// The statements the SDK sends for the same three steps (packages/client/src/availability.ts and
// holds.ts), so a reader with any Postgres client can do it without the SDK.
const SQL = `SELECT * FROM availability
  WHERE resource_id = $1 AND start >= $2 AND "end" <= $3 AND min_duration = $4;

INSERT INTO holds (id, resource_id, start, "end", expires_at) VALUES ($1, $2, $3, $4, $5);

UPDATE holds SET booking_id = $1 WHERE id = $2;  -- commit: the hold becomes the booking`;

export default function BookingApiConsolePage() {
  return (
    <ToolShell
      tool={TOOL}
      ld={[webApplicationLd({ title: TOOL.title, description: TOOL.description, path: TOOL.href, category: "DeveloperApplication" })]}
      lead={
        <p>
          A booking API is three calls: find what is free, hold a slot, commit it. Run each one here against a live Δt calendar. The code on the
          left is the TypeScript SDK call, and the reply on the right is what the engine sent back, unedited.
        </p>
      }
    >
      <ApiConsole />

      <HowItWorks
        title="What each call does"
        steps={[
          { title: "Find", body: "Returns the free stretches in a window, already minus bookings and live holds. It is a read; it promises nothing." },
          {
            title: "Hold",
            body: "Takes the slot out of circulation for as long as you ask, up to the server's limit, and lets go on its own. A second hold on the same time is refused with CONFLICT and the next free times, which is what the other button shows.",
          },
          { title: "Commit", body: "Turns the hold into a booking in one statement. There is no moment between the two where someone else could take the slot." },
        ]}
      />

      <ToolSection title="Use it from your own code">
        <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2">
          Run Δt yourself (one binary, or Docker; see{" "}
          <Link href="/docs/sdk/self-host" className="text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            self-host
          </Link>
          ), install the SDK and connect:
        </p>
        <div className="mt-4 grid gap-3">
          <CodeBlock code={INSTALL} label="Install" event="tool-api-console-use" from="install" />
          <CodeBlock code={CONNECT} label="Connect and make a calendar" />
        </div>
        <p className="mt-6 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2">
          Δt speaks the Postgres wire protocol, so the SDK is optional. These are the statements it sends for the same three steps; any Postgres
          client can send them too.
        </p>
        <CodeBlock code={SQL} label="The same calls in SQL" className="mt-4" />
        <p className="mt-6 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2">
          Next:{" "}
          <Link href="/docs/sdk/quickstart" data-umami-event="tool-api-console-app" data-umami-event-from="sdk-quickstart" className="font-medium text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            the TypeScript quickstart
          </Link>{" "}
          adds capacity, buffers and live updates; the{" "}
          <Link href="/docs/sdk/reference" className="text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            SDK reference
          </Link>{" "}
          lists every call.
        </p>
      </ToolSection>
    </ToolShell>
  );
}
