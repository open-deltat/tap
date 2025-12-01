const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const isWithinHorizon = (
	timestamp: number,
	horizonDays: number,
	now = Date.now(),
): boolean => {
	const horizonMs = horizonDays * MS_PER_DAY;
	return timestamp >= now && timestamp <= now + horizonMs;
};
