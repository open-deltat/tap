import type { DayKey, Minute, ResourceId, TenantId } from '../../domain/ids';
import type { BitmapDay } from '../../infrastructure/bitmap';

export type AllocatorState = Map<DayKey, BitmapDay>;

export type HoldMetadata = {
	tenantId: TenantId;
	resourceId: ResourceId;
	day: DayKey;
	start: Minute;
	end: Minute;
	expiresAt: number;
};
