# Tools pages: how one is built

Every page the `/tools` hub lists follows this. Reference page: `app/tools/double-booking-race/page.tsx`.

## Registry first

A page exists once it has an entry in `lib/tools/registry.ts` (href, Umami `event`, group, icon, label,
blurb, title, h1, description of 140 to 160 characters). The hub, the sitemap, llms.txt and the page's
metadata all read it. Never restate a title or description in the page.

```ts
const TOOL = toolByHref("/tools/<slug>");
export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });
```

## Page order, top to bottom

1. `ToolShell` (breadcrumb, the one H1 from the registry, a one-paragraph `lead`). It adds the breadcrumb
   JSON-LD, the product offer and the footer itself; never add them by hand.
2. The tool or the main content, first, where the eye already is.
3. `HowItWorks` steps, when there is a mechanism to explain.
4. `ToolSection` blocks for anything else. Prose inside goes through `<Markdown>` so it matches the docs.
5. `Sources`, only on pages that state outside facts (comparisons). Always with the read date.

## Which component for which content

| Content | Component |
|---|---|
| Real calls to Δt and their replies | `CallTrace` (data from `lib/tools/trace.ts` `timed()`) |
| A snippet, command or prompt to copy | `CodeBlock` with `event="tool-<event>-use"` |
| Numbered steps | `HowItWorks` |
| A vendor comparison | `CompareTable` |
| Dated outside facts | `Sources` |

## Structured data, per page type

- A tool that runs in the page: `webApplicationLd`.
- A set-up guide with steps shown on the page: `howToLd`, steps exactly as shown.
- A comparison: `techArticleLd`.
- A list of pages (hub, templates): `collectionPageLd`.

## Events

`data-umami-event="tool-<event>-use"` on the main action (the run button, the copy button of the main
snippet). `tool-<event>-app` on links to the product or a live demo, with `data-umami-event-from`.
The offer at the end already sends `tool-<event>-app` with `from=offer`.

## Look

Site tokens only (`dt-*`). Cards: `rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface`.
Small cards `rounded-2xl`. Body text 15 to 15.5px, `text-dt-ink-2`. Green is free, amber is held, ink is
booked; a refusal is amber, never red. Mobile first-class: check 390px for overflow.

## Rules

- Nothing faked. A live result comes from Δt; anything scripted says so on the page.
- A page that lacks a piece (no sources, no mechanism) leaves that component out; it never adds filler.
- Component defaults never add wording a page did not ask for.
- Comparisons: Δt first and marked as ours, competitor facts only from their own pages with the date
  and link, no logos, and a plain "when they are the better choice" section.
- Leave alone: `/embed/*`, `/embed-test`, the demo pages, `/b/*`.
