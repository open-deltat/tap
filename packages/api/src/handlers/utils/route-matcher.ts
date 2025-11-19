export const matchRoute = (
	pathname: string,
	pattern: string,
): Record<string, string> | null => {
	const patternParts = pattern.split('/').filter(Boolean);
	const pathParts = pathname.split('/').filter(Boolean);

	if (patternParts.length !== pathParts.length) {
		return null;
	}

	const params: Record<string, string> = {};
	for (let i = 0; i < patternParts.length; i++) {
		const patternPart = patternParts[i];
		const pathPart = pathParts[i];
		if (!patternPart || !pathPart) {
			return null;
		}
		if (patternPart.startsWith(':')) {
			const key = patternPart.slice(1);
			params[key] = pathPart;
		} else if (patternPart !== pathPart) {
			return null;
		}
	}
	return params;
};



