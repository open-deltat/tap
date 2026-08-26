import type { Sql } from "postgres";
import type { DeltaTEvent } from "./types.js";

export class Events {
  constructor(private readonly sql: Sql) {}

  /**
   * Subscribe to a resource's change stream over LISTEN/NOTIFY. Resolves to an unsubscribe function;
   * await it to stop listening. Malformed payloads are skipped rather than thrown to the callback.
   * A throwing callback is isolated: the error goes to `onError` (or `console.error` when no hook is
   * given) instead of tearing down the LISTEN connection shared by every subscription of this client.
   */
  async listen(
    resourceId: string,
    callback: (event: DeltaTEvent) => void,
    options?: { onError?: (error: unknown) => void }
  ): Promise<() => Promise<void>> {
    const channel = `resource_${resourceId}`;

    const meta = await this.sql.listen(
      channel,
      (payload: string) => {
        let event: DeltaTEvent;
        try {
          event = JSON.parse(payload) as DeltaTEvent;
        } catch {
          // Ignore malformed payloads.
          return;
        }
        try {
          callback(event);
        } catch (error) {
          // postgres.js dispatches notifications synchronously inside its socket data handler and
          // treats a throw there as a connection error, destroying the single LISTEN connection for
          // all subscribers. Contain subscriber errors here instead.
          try {
            if (options?.onError) options.onError(error);
            else console.error("deltat: event subscriber threw", error);
          } catch {
            // A throwing onError hook would tear down the connection the same way. Drop it.
          }
        }
      }
    );

    return async () => {
      await meta.unlisten();
    };
  }
}
