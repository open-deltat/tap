#!/usr/bin/env bun

import { $ } from 'bun';

async function getBaseRef(): Promise<string> {
	if (process.env.CI === 'true') {
		if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
			return process.env.GITHUB_BASE_REF || 'main';
		}
		return 'main';
	}
	
	try {
		const branch = await $`git rev-parse --abbrev-ref HEAD`.quiet();
		const branchName = branch.stdout.toString().trim();
		return branchName === 'main' ? 'HEAD~1' : 'origin/main';
	} catch {
		return 'HEAD~1';
	}
}

async function getChangedPackages(): Promise<string[]> {
	const baseRef = await getBaseRef();
	
	try {
		const result = await $`turbo run build --dry-run=json --filter=...[${baseRef}]`.quiet();
		if (result.exitCode !== 0) {
			return [];
		}
		
		const output = JSON.parse(result.stdout.toString());
		const packages = output.tasks
			?.map((task: { package: string }) => task.package)
			.filter((pkg: string) => pkg && pkg.startsWith('@open-tap/'))
			.filter((pkg: string, index: number, arr: string[]) => arr.indexOf(pkg) === index) || [];
		
		return packages;
	} catch {
		return [];
	}
}

async function main() {
	const packages = await getChangedPackages();
	console.log(packages.join(' '));
}

main().catch(() => {
	process.exit(1);
});

