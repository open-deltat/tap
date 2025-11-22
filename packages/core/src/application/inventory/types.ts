import type {
	DayKey,
	Minute,
	ResourceId,
	SessionId,
	TenantId,
} from '../../domain/ids';
import type { BitmapDay } from '../../infrastructure/bitmap';

export type AllocatorState = Map<DayKey, BitmapDay>;

export type HoldMetadata = {
	tenantId: TenantId;
	resourceId: ResourceId;
	sessionId: SessionId;
	day: DayKey;
	start: Minute;
	end: Minute;
	expiresAt: number;
};
