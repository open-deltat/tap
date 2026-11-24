// One real call a tool made to Δt, as the page shows it: who made it, what it sent and exactly what
// came back. Shared by the API console, the race and the agent run, so the three show calls alike.
// Plain data, safe on client and server.

export type CallKind = "find" | "hold" | "commit" | "release" | "read";

export type CallOutcome =
  | { readonly ok: true; readonly reply: unknown }
  | { readonly ok: false; readonly code: string; readonly reply: unknown };

export interface Call {
  readonly who: string;
  readonly kind: CallKind;
  /** The SDK method or MCP tool name, exactly as a developer would type it. */
  readonly name: string;
  readonly args: unknown;
  readonly outcome: CallOutcome;
  /** Measured on our server around the call to Δt, so it is the engine's time plus one hop. */
  readonly ms: number;
}

/** Time one call and keep its outcome, never throwing: a refusal is a result the page shows. */
export async function timed(
  meta: Pick<Call, "who" | "kind" | "name" | "args">,
  run: () => Promise<unknown>,
  refuse: (err: unknown) => { code: string; reply: unknown }
): Promise<Call> {
  const t0 = performance.now();
  const outcome = await run().then(
    (reply): CallOutcome => ({ ok: true, reply }),
    (err): CallOutcome => ({ ok: false, ...refuse(err) })
  );
  return { ...meta, outcome, ms: Math.round((performance.now() - t0) * 10) / 10 };
}
