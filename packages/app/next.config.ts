import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	transpilePackages: ['@tap/core'],
	turbopack: {},
};

export default nextConfig;
