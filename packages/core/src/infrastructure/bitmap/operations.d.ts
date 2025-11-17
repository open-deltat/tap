import type { Minute } from '../../domain/ids';
import type { BitmapDay } from './types';
export declare const createEmptyBitmap: () => Uint8Array;
export declare const getBit: (bitmap: Uint8Array, minute: Minute) => boolean;
export declare const setBitRange: (
	bitmap: Uint8Array,
	start: Minute,
	end: Minute,
	value: boolean,
) => void;
export declare const isRangeFree: (
	booked: Uint8Array,
	held: Uint8Array,
	start: Minute,
	end: Minute,
) => boolean;
export declare const createBitmapDay: (resolution?: number) => BitmapDay;
//# sourceMappingURL=operations.d.ts.map
