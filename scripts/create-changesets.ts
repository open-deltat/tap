#!/usr/bin/env bun

import { $ } from 'bun';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const PACKAGES_DIR = join(import.meta.dir, '../packages');
const CHANGESETS_DIR = join(import.meta.dir, '../.changeset');

const PUBLIC_PACKAGES = [
	'@open-tap/protocol',
	'@open-tap/core',
	'@open-tap/client',
];

type ChangeType = 'patch' | 'minor' | 'major';

interface PackageChanges {
	packageName: string;
	changeType: ChangeType;
	files: string[];
}

async function getChangedFiles(): Promise<string[]> {
	const files: string[] = [];
	const isCI = process.env.CI === 'true';

	if (isCI) {
		try {
			const lastCommit = await $`git diff --name-only HEAD~1 HEAD`.quiet();
			if (lastCommit.exitCode === 0 && lastCommit.stdout.toString().trim()) {
				files.push(...lastCommit.stdout.toString().trim().split('\n').filter(Boolean));
			}
		} catch {
		}
	} else {
		try {
			const uncommitted = await $`git diff --name-only`.quiet();
			if (uncommitted.exitCode === 0 && uncommitted.stdout.toString().trim()) {
				files.push(...uncommitted.stdout.toString().trim().split('\n').filter(Boolean));
			}
		} catch {
		}

		try {
			const staged = await $`git diff --cached --name-only`.quiet();
			if (staged.exitCode === 0 && staged.stdout.toString().trim()) {
				files.push(...staged.stdout.toString().trim().split('\n').filter(Boolean));
			}
		} catch {
		}

		try {
			const branch = await $`git rev-parse --abbrev-ref HEAD`.quiet();
			const branchName = branch.stdout.toString().trim();

			if (branchName !== 'main') {
				try {
					const diff = await $`git diff --name-only origin/main...HEAD`.quiet();
					if (diff.exitCode === 0 && diff.stdout.toString().trim()) {
						files.push(...diff.stdout.toString().trim().split('\n').filter(Boolean));
					}
				} catch {
				}
			}
		} catch {
		}
	}

	return [...new Set(files)];
}

function mapFileToPackage(file: string): string | null {
	if (file.startsWith('packages/')) {
		const parts = file.split('/');
		const packageName = parts[1];

		if (PUBLIC_PACKAGES.includes(`@open-tap/${packageName}`)) {
			return `@open-tap/${packageName}`;
		}
	}

	if (file.startsWith('packages/protocol/')) {
		return '@open-tap/protocol';
	}
	if (file.startsWith('packages/core/')) {
		return '@open-tap/core';
	}
	if (file.startsWith('packages/client/')) {
		return '@open-tap/client';
	}

	return null;
}

function determineChangeType(files: string[]): ChangeType {
	const hasBreaking = files.some((f) =>
		f.includes('BREAKING') ||
		f.includes('breaking') ||
		f.includes('major')
	);

	if (hasBreaking) {
		return 'major';
	}

	const hasNewFeature = files.some((f) =>
		f.includes('feat') ||
		f.includes('feature') ||
		f.includes('add') ||
		f.includes('new')
	);

	if (hasNewFeature) {
		return 'minor';
	}

	return 'patch';
}

async function getPackageChanges(): Promise<Map<string, PackageChanges>> {
	const changedFiles = await getChangedFiles();
	const packageMap = new Map<string, PackageChanges>();

	for (const file of changedFiles) {
		const packageName = mapFileToPackage(file);
		if (!packageName) continue;

		const existing = packageMap.get(packageName);
		if (existing) {
			existing.files.push(file);
		} else {
			packageMap.set(packageName, {
				packageName,
				changeType: 'patch',
				files: [file],
			});
		}
	}

	for (const changes of packageMap.values()) {
		changes.changeType = determineChangeType(changes.files);
	}

	return packageMap;
}

function generateChangesetContent(
	packageName: string,
	changeType: ChangeType,
): string {
	const messages = {
		major: `Breaking changes in ${packageName}`,
		minor: `New features in ${packageName}`,
		patch: `Bug fixes and updates in ${packageName}`,
	};

	return `---
"${packageName}": ${changeType}
---

${messages[changeType]}
`;
}

async function createChangesetFile(
	packageName: string,
	changeType: ChangeType,
): Promise<string> {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	const filename = `${timestamp}-${random}.md`;
	const filepath = join(CHANGESETS_DIR, filename);
	const content = generateChangesetContent(packageName, changeType);

	await writeFile(filepath, content, 'utf-8');
	return filename;
}

async function main() {
	console.log('🔍 Detecting package changes...\n');

	const packageChanges = await getPackageChanges();

	if (packageChanges.size === 0) {
		console.log('✅ No changes detected in public packages.');
		console.log('   Public packages:', PUBLIC_PACKAGES.join(', '));
		return;
	}

	console.log(`📦 Found changes in ${packageChanges.size} package(s):\n`);

	for (const changes of packageChanges.values()) {
		console.log(`   ${changes.packageName} (${changes.changeType})`);
		console.log(`   Files: ${changes.files.length}`);
	}

	console.log('\n📝 Creating changesets...\n');

	const createdFiles: string[] = [];

	for (const changes of packageChanges.values()) {
		const filename = await createChangesetFile(
			changes.packageName,
			changes.changeType,
		);
		createdFiles.push(filename);
		console.log(`   ✅ Created: ${filename} (${changes.packageName} - ${changes.changeType})`);
	}

	console.log(`\n✨ Created ${createdFiles.length} changeset(s)!`);

	const isCI = process.env.CI === 'true';
	if (!isCI) {
		console.log('\n💡 Next steps:');
		console.log('   1. Review the changesets in .changeset/');
		console.log('   2. Edit them if needed to add more details');
		console.log('   3. Commit and push');
		console.log('   4. Merge to main to trigger publishing');
	}
}

main().catch((error) => {
	console.error('❌ Error:', error);
	process.exit(1);
});

