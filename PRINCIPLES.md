# Product principles

Two ideas govern everything this product shows to a person, a developer, or a model.

## 1. Build the primitive once; scope the product, not the engine

deltat's kernel takes arbitrary resources. A resource has a capacity, an optional parent, a buffer,
and a place in a tree. A restaurant with fifty tables, a hotel with room types, a flight with seats,
and one person's appointment calendar are the same primitive at different shapes. The client, the
SDK, and the MCP server expose that primitive directly, so anyone running their own deltat can model
any of them today.

The hosted platform chooses to show one shape: a single calendar with open hours. That is a *product*
decision at the UI layer, not a limit in the engine. Someone who self-deploys this repository is not
restricted, and the managed builder for richer spaces ([`deltat` VIS-11](https://github.com/open-deltat/deltat))
is deferred, not foreclosed. Build the capability once and it works everywhere: self-host, managed,
SDK, API, MCP. The UI decides what to reveal; it never removes what the kernel can do.

Corollary: never bake "one resource per calendar" so deep that multi-resource needs a rewrite. The
ownership/registry layer names the things people book; it should extend to a group of resources
without changing the kernel or the wire.

## 2. Everything a stranger sees must be beautiful and obvious

This is a product people hand to each other. A booking link goes from a business to its customers. A
calendar is shared peer to peer. An API and an MCP server are handed to another developer, or to
another company's AI agent. Each of those is a first impression made without us in the room, so every
externally-facing surface is a growth surface, and an ugly or confusing one is a growth bug. The
technology is good enough that the moment someone uses it they understand it; beauty is what gets them
to that moment. Treat it as load-bearing, not decoration.

"Externally-facing" is wider than the UI:

- **The booking page and dashboard.** Beautiful, theme-aware, legible in seconds. A stranger should
  understand what this is and how to use it without being told.
- **The docs and developer experience.** A copy-paste quickstart that actually runs, honest examples,
  no dead ends.
- **The API and the SDK.** Names that read like the domain; errors that say what to do next.
- **The MCP tools and `llms.txt`.** Tool descriptions, argument names, and typed errors are read by a
  model on every call and surfaced in its reasoning to the user. They are UX. `CONFLICT: pick another
  slot` is good design; a raw stack trace is not. An agent-facing surface gets the same care as a
  human-facing one, because increasingly the agent is the user.
