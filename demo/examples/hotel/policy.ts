// The hotel's check-in/check-out policy (its local time). Kept in a plain module — not seed.ts —
// because a "use server" file may only export async functions, not constants. A stay is booked as
// [check-in day 3 PM, check-out day 11 AM).
export const CHECK_IN_HOUR = 15;
export const CHECK_OUT_HOUR = 11;
