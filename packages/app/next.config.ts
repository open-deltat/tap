import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	transpilePackages: ['@tap/ws-client', '@tap/core'],
	turbopack: {},
};

export default nextConfig;
