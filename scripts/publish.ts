#!/usr/bin/env bun

console.log('📦 Publishing is handled by Changesets + GitHub Actions');
console.log('');
console.log('Workflow:');
console.log('  1. Make changes to packages');
console.log('  2. Run: bun run changeset');
console.log('  3. Select packages to version (patch/minor/major)');
console.log('  4. Commit and push changeset');
console.log('  5. GitHub Actions will create a PR with version bumps');
console.log('  6. Merge PR to main → packages auto-publish');
console.log('');
console.log('Packages can be versioned independently!');
