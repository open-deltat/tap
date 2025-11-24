// In the interval model, horizon checking is just unix timestamp comparison.
// We don't need complex day parsing.

export const isWithinHorizon = (
	timestamp: number,
	horizonDays: number,
	now: number = Date.now(),
): boolean => {
	const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
	return timestamp >= now && timestamp <= now + horizonMs;
};
