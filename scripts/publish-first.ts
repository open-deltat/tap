#!/usr/bin/env bun

import { $ } from 'bun';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dir, '..');

const updatePackageJson = (
	filePath: string,
	updates: Record<string, string>,
): void => {
	const content = readFileSync(filePath, 'utf-8');
	const pkg = JSON.parse(content);
	for (const [key, value] of Object.entries(updates)) {
		if (pkg.dependencies?.[key]) {
			pkg.dependencies[key] = value;
		}
	}
	writeFileSync(filePath, JSON.stringify(pkg, null, '\t') + '\n');
};

console.log('🚀 Publishing TAP packages for the first time\n');

// Step 1: Version packages using changeset
console.log('📦 Versioning packages...');
await $`cd ${rootDir} && bunx changeset version`.quiet();
console.log('✅ Packages versioned\n');

// Step 2: Build
console.log('🔨 Building packages...');
await $`cd ${rootDir} && bun run build:packages`.quiet();
console.log('✅ Packages built\n');

// Step 3: Publish @open-tap/protocol
console.log('📦 Publishing @open-tap/protocol...');
await $`cd ${rootDir}/packages/protocol && npm publish --access public`.quiet();
console.log('✅ @open-tap/protocol published\n');

// Step 4: Update @open-tap/core dependencies and publish
console.log('📦 Publishing @open-tap/core...');
const coreVersion = JSON.parse(
	readFileSync(resolve(rootDir, 'packages/core/package.json'), 'utf-8'),
).version;
const protocolVersion = JSON.parse(
	readFileSync(resolve(rootDir, 'packages/protocol/package.json'), 'utf-8'),
).version;

updatePackageJson(resolve(rootDir, 'packages/core/package.json'), {
	'@open-tap/protocol': `^${protocolVersion}`,
});
await $`cd ${rootDir}/packages/core && npm publish --access public`.quiet();
updatePackageJson(resolve(rootDir, 'packages/core/package.json'), {
	'@open-tap/protocol': 'workspace:*',
});
console.log('✅ @open-tap/core published\n');

// Step 5: Update @open-tap/client dependencies and publish
console.log('📦 Publishing @open-tap/client...');
updatePackageJson(resolve(rootDir, 'packages/client/package.json'), {
	'@open-tap/protocol': `^${protocolVersion}`,
	'@open-tap/core': `^${coreVersion}`,
});
await $`cd ${rootDir}/packages/client && npm publish --access public`.quiet();
updatePackageJson(resolve(rootDir, 'packages/client/package.json'), {
	'@open-tap/protocol': 'workspace:*',
	'@open-tap/core': 'workspace:*',
});
console.log('✅ @open-tap/client published\n');

console.log('🎉 All packages published successfully!');
console.log('\n⚠️  Remember to commit the version changes:');
console.log('   git add packages/*/package.json');
console.log('   git commit -m "chore: initial release"');
console.log('   git push');

