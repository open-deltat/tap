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

async function getChangedFiles(): Promise<string[]> {
	const baseRef = await getBaseRef();
	
	try {
		const result = await $`git diff --name-only ${baseRef}...HEAD`.quiet();
		if (result.exitCode !== 0) {
			return [];
		}
		return result.stdout.toString().trim().split('\n').filter(Boolean);
	} catch {
		return [];
	}
}

async function main() {
	const changedFiles = await getChangedFiles();
	
	if (changedFiles.length === 0) {
		console.log('No files changed, skipping lint');
		process.exit(0);
	}
	
	const filesToCheck = changedFiles
		.filter((file) => 
			file.endsWith('.ts') || 
			file.endsWith('.tsx') || 
			file.endsWith('.js') || 
			file.endsWith('.jsx') ||
			file.endsWith('.json')
		)
		.filter((file) => 
			!file.includes('node_modules') &&
			!file.includes('dist') &&
			!file.includes('.next')
		);
	
	if (filesToCheck.length === 0) {
		console.log('No lintable files changed, skipping lint');
		process.exit(0);
	}
	
	console.log(`Linting ${filesToCheck.length} changed file(s)...`);
	await $`bunx @biomejs/biome check --write ${filesToCheck}`;
}

main().catch((error) => {
	console.error('Error:', error);
	process.exit(1);
});

