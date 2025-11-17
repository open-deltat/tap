import type { TenantId } from '@tap/core';

export const createTenantResolver = () => {
	const cache = new Map<string, { id: TenantId; slug: string }>();

	return {
		resolveBySlug: async (slug: string): Promise<TenantId | null> => {
			const cached = cache.get(slug);
			if (cached) {
				return cached.id;
			}

			return null;
		},

		register: (slug: string, id: TenantId) => {
			cache.set(slug, { id, slug });
		},
	};
};
