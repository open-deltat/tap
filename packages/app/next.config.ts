import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	output: 'standalone',
	transpilePackages: ['@open-tap/core'],
	turbopack: {},
};

export default nextConfig;
