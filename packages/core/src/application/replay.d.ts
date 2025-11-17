import type { LedgerEvent } from '../domain/events';
import type { Allocator } from './allocator/allocator';
export declare const replayEvents: (
	allocator: Allocator,
	events: LedgerEvent[],
) => Promise<void>;
//# sourceMappingURL=replay.d.ts.map
