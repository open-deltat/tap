import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	transpilePackages: ['@tap/stream-client'],
	turbopack: {},
};

export default nextConfig;
