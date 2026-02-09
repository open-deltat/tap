import type { Sql } from "postgres";
import type { DeltaTEvent } from "./types.js";

export class Events {
  constructor(private readonly sql: Sql) {}

  async listen(
    resourceId: string,
    callback: (event: DeltaTEvent) => void
  ): Promise<() => Promise<void>> {
    const channel = `resource_${resourceId}`;

    const meta = await this.sql.listen(
      channel,
      (payload: string) => {
        try {
          const event = JSON.parse(payload) as DeltaTEvent;
          callback(event);
        } catch {
          // Ignore malformed payloads
        }
      }
    );

    return async () => {
      await meta.unlisten();
    };
  }
}
