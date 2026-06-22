# Demo architecture

The demo is a catalog of **examples** (airline, cinema, stadium, hotel, …) over one shared
deltat tenant. It's built so a deployment can expose the whole catalog *or* a single example
(e.g. a cinema-only product), and so each example is self-contained and easy to read.

## Deployment isolation — `DEMO_EXAMPLES`

One env var governs which examples a deployment exposes; nav, seeding, and routing all derive
from it (`examples/config.ts`):

```
DEMO_EXAMPLES=cinema             # cinema only
DEMO_EXAMPLES=hotel,restaurant   # a subset
# unset / DEMO_EXAMPLES=all      # the full catalog
```

- **Nav** (`components/nav-header.tsx`) renders `enabledExamples()` — disabled examples vanish.
- **Seeding** (`scripts/seed-all.ts`) runs only the enabled examples' seeds (`examples/seeds.ts`).
- **Routes** (planned) 404 for disabled examples via a guard in each `app/demos/<id>` shim.

## The registry

| File | Role | Safe to import from |
|---|---|---|
| `examples/config.ts` | id list + `isExampleEnabled` / `enabledExampleIds` (pure, no React) | client **and** server |
| `examples/manifest.ts` | label + icon + spec tag per example; `enabledExamples()` | client (nav, home) |
| `examples/seeds.ts` | id → seed action | server (seed script, route shims) |

Adding an example = add its id to `config.ts`, its label/icon to `manifest.ts`, its seed to
`seeds.ts`, and its folder under `examples/<id>/`.

## Layers

- `lib/` — shared infra: `deltat` (client), `session` + `session-bookings` (ephemeral per-visitor
  bookings + reaper), `schemas`, `time`, `utils`.
- `components/` — shared UI: `stage`, `booking-confirmed-modal`, `session-sidebar`,
  `seat-booking-page` + `seat-map` (used by every assigned-seat example), `ui/*`.
- `examples/<id>/` — **example-specific** code: its `seed.ts`, its page component, and any
  components only it uses. (Migration in progress — see below.)
- `app/demos/<id>/page.tsx` — thin route shim: enablement guard → render the example.
- `proxy.ts` — mints the per-visitor session cookie.

## Mobile

The demo is **mobile-friendly** (not mobile-first): every example must be usable and well-laid-out
on a phone browser, because bookings increasingly happen on phones. The desktop layouts are the
reference and must render **byte-identical** at `>=640px` — so mobile is added as a layer, never by
changing the desktop output.

Conventions:

- **Responsive prefixes, desktop re-pinned.** Put the mobile value as the bare class and restore the
  current desktop value at the breakpoint: `px-3 sm:px-6`, `w-20 sm:w-32`, `flex-col md:flex-row`.
  Never drop a desktop class without re-pinning it at `sm:`/`md:`. `flex-wrap` is a safe addition —
  it's a no-op when content already fits (i.e. at desktop widths).
- **Use the width.** The `/demos` shell hides the session sidebar (`session-sidebar.tsx`, `hidden
  sm:flex`) and `Stage` tightens its padding (`px-3 sm:px-6`, `p-4 sm:p-6`) on phones, so the example
  gets the full screen.
- **Fixed-size grids scale, they don't reflow.** Seat maps must keep every seat the *same shape*, so
  they can't shrink cells responsively. Instead they're wrapped in `components/fit-to-width.tsx`,
  which uniformly scales the whole grid down to fit the viewport (`scale = min(1, containerW /
  naturalW)`). At desktop widths the scale is `1` — identity transform, byte-identical. Genuinely
  wide ribbons (the 21-day finder) may use horizontal scroll instead (`overflow-x-auto` +
  `min-w-[…] sm:min-w-0`).

Verify any change at **390px** (fits, no horizontal overflow, seats keep their shape) **and 1280px**
(pixel-identical to before).

## Folder migration status

Each example is being moved into a self-contained `examples/<id>/` folder (seed + page +
example-only components), leaving only shared code in `lib/` and `components/`. The registry
above already isolates examples functionally; the folder move is the readability pass.
