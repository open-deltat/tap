# Contributing to tap

Thanks for your interest. tap is the TypeScript client layer for [deltat](https://github.com/open-deltat/deltat):
a typed SDK (`@open-tap/client`) plus demo apps. Contributions are held to a high correctness and
clarity bar.

## Ground rules

- **deltat owns the semantics.** Availability, conflicts, capacity, holds, and buffers are computed
  by the deltat kernel. The SDK is a thin, faithful transport over its wire protocol; it must not
  reimplement or second-guess kernel behavior. When the client has to compensate for a kernel quirk
  (for example windowing `get()` results client-side), say so in a comment.
- **Principles:** first-principles, KISS/Occam, DRY without premature abstraction, SOLID, small
  composable functions, no over-engineering. Comment the *why*, not the *what*.
- **Types over escapes.** No `as any`, no non-null assertions (`!`). Narrow with type guards and
  early returns instead. Never string-splice ids or values into SQL; use positional (`$N`) params.

## Tests

- **Test-first for fixes.** A bug fix lands with the test that reproduces it. A feature extends the
  executable spec. A fix without a test that would have caught it is incomplete.
- Tests are `*.test.ts` run natively by `bun test`. Keep them fast and deterministic (no wall clock,
  no live server; use fixed instants).

## Local checks (must pass before a PR)

```bash
bun install --frozen-lockfile
bun test                                 # SDK + shared date logic
cd packages/client && bun run build      # published SDK must compile; dist must not ship test files
cd calendar && bunx tsc --noEmit         # calendar app typechecks
```

CI runs `bun test` and the SDK build on every push and pull request.

## Pull requests

- One logical change per PR; keep the diff focused.
- Match the surrounding code: naming, comment density, idiom.
- Update the SDK `README.md` and `CHANGELOG.md` when the public surface changes.
