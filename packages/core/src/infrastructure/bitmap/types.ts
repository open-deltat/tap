export type BitmapDay = {
	booked: Uint16Array; // Usage count instead of bits
	held: Uint16Array; // Usage count instead of bits
	resolution: number;
};
