## What and why

What this changes, and the reason for it. Link any related issue.

## Checklist

- [ ] One logical change, focused diff.
- [ ] `bun test` passes.
- [ ] `cd packages/client && bun run build` compiles and dist ships no test files.
- [ ] `cd calendar && bunx tsc --noEmit` is clean (if the calendar app is touched).
- [ ] No `as any` and no non-null assertions (`!`); SQL uses positional params.
- [ ] Public SDK surface changes update the SDK `README.md` and `CHANGELOG.md`.
