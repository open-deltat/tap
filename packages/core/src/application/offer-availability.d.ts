import type { DayKey, Minute } from '../domain/ids';
import type { Offer } from '../domain/schemas';
export declare const getAvailableMinutesFromOffers: (
	day: DayKey,
	offers: Offer[],
) => Set<Minute>;
//# sourceMappingURL=offer-availability.d.ts.map
