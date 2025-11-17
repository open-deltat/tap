#!/usr/bin/env bun

import { spawn } from 'bun';
import { resolve } from 'path';

const checkPort = async (port: number): Promise<boolean> => {
	try {
		const server = Bun.serve({
			port,
			fetch: () => new Response(),
		});
		server.stop();
		return true;
	} catch {
		return false;
	}
};

const findAvailablePort = async (
	startPort: number,
	excludePort?: number,
): Promise<number> => {
	for (let port = startPort; port < startPort + 10; port++) {
		if (port === excludePort) continue;
		if (await checkPort(port)) {
			return port;
		}
	}
	throw new Error(`No available port found starting from ${startPort}`);
};

const API_PORT = process.env.API_PORT
	? parseInt(process.env.API_PORT, 10)
	: await findAvailablePort(3000);
const APP_PORT = process.env.APP_PORT
	? parseInt(process.env.APP_PORT, 10)
	: await findAvailablePort(3001, API_PORT);

console.log('🚀 Starting TAP development servers...');
console.log(`   API: http://localhost:${API_PORT}`);
console.log(`   App: http://localhost:${APP_PORT}`);
console.log('');

const rootDir = resolve(import.meta.dir, '..');

const apiProcess = spawn({
	cmd: ['bun', 'run', 'dev'],
	cwd: resolve(rootDir, 'packages/api'),
	env: {
		...process.env,
		PORT: String(API_PORT),
	},
	stdout: 'inherit',
	stderr: 'inherit',
});

await new Promise((resolve) => setTimeout(resolve, 2000));

const appProcess = spawn({
	cmd: ['bun', 'run', 'dev', '--turbopack', '--port', String(APP_PORT)],
	cwd: resolve(rootDir, 'packages/app'),
	env: {
		...process.env,
		PORT: String(APP_PORT),
	},
	stdout: 'inherit',
	stderr: 'inherit',
});

process.on('SIGINT', () => {
	console.log('\n🛑 Shutting down servers...');
	apiProcess.kill();
	appProcess.kill();
	process.exit(0);
});

process.on('SIGTERM', () => {
	apiProcess.kill();
	appProcess.kill();
	process.exit(0);
});

await Promise.all([apiProcess.exited, appProcess.exited]);

