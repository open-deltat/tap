# tap

## Code Principles

These apply to ALL code in this repo. No exceptions.

- **First principles** — understand the problem before writing code. Ask "why" before "how."
- **Occam's razor / KISS** — the simplest solution that works is the right one. Don't add complexity you can't justify.
- **DRY** — don't repeat yourself, but don't abstract prematurely either. Three similar lines beats a premature abstraction.
- **SOLID**
  - **Single responsibility** — every module, class, and function does one thing. If you can describe it with "and", split it.
  - **Open/closed** — open for extension, closed for modification.
  - **Liskov substitution** — subtypes must be substitutable for their base types.
  - **Interface segregation** — no client should depend on methods it doesn't use.
  - **Dependency inversion** — depend on abstractions, not concretions.
- **Composable** — small, focused functions that combine. No god functions, no god classes.
- **No over-engineering** — only build what's needed now. No feature flags, no "just in case" abstractions, no hypothetical future requirements.
- **No unnecessary comments** — code should be self-documenting. Only comment the "why", never the "what."
- **No duplicated state** — one source of truth. If data can be derived, derive it. Don't store it twice.

## What is tap

SDK + demos for [deltat](https://github.com/open-tap/deltat), a time-allocation database.

## Structure

```
packages/
  client/          @open-tap/client — TypeScript SDK wrapping deltat's pgwire SQL
demo/              Next.js app — demo pages showing holds, calendars, seat maps, etc.
```

## Commands

```bash
# Install deps (Bun workspace)
bun install

# Build SDK
cd packages/client && bun run build

# Dev (starts deltat + Next.js)
cd demo && ./dev.sh

# Production build
cd demo && bun run build
```

## Environment

- Runtime: Bun
- Demo connects to deltat on localhost:5433 (override via DELTAT_HOST, DELTAT_PORT, DELTAT_DB, DELTAT_USER, DELTAT_PASSWORD)
