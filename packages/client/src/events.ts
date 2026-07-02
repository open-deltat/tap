import type { Sql } from "postgres";
import type { DeltaTEvent } from "./types.js";

export class Events {
  constructor(private readonly sql: Sql) {}

  /**
   * Subscribe to a resource's change stream over LISTEN/NOTIFY. Resolves to an unsubscribe function;
   * await it to stop listening. Malformed payloads are skipped rather than thrown to the callback.
   */
  async listen(
    resourceId: string,
    callback: (event: DeltaTEvent) => void
  ): Promise<() => Promise<void>> {
    const channel = `resource_${resourceId}`;

    const meta = await this.sql.listen(
      channel,
      (payload: string) => {
        let event: DeltaTEvent;
        try {
          event = JSON.parse(payload) as DeltaTEvent;
        } catch {
          // Ignore malformed payloads; do not swallow errors from the subscriber below.
          return;
        }
        callback(event);
      }
    );

    return async () => {
      await meta.unlisten();
    };
  }
}
