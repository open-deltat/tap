import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	transpilePackages: ['@open-tap/core'],
	turbopack: {},
};

export default nextConfig;
