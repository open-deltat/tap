# Releasing

Two packages publish to npm from this repo, plus one registry submission. None of it is automated
yet: publishing needs an npm token and the MCP registry needs an interactive login, and neither
belongs in a public repo's CI without a scoped secret being set up first.

| Package | Registry | Command |
|---|---|---|
| `@open-deltat/client` | npm | `bun publish` from `packages/client` |
| `@open-deltat/mcp` | npm | `bun publish` from `packages/mcp` |
| `io.github.open-deltat/deltat` | MCP registry | `mcp-publisher publish` from `packages/mcp` |

## Before publishing anything

```bash
bun install --frozen-lockfile
cd packages/client && bun run build && cd ../..
bun test
```

All suites must pass. `packages/client` has to be built first because the other packages resolve it
through its `dist`.

## Publishing a package to npm

Bump the version in that package's `package.json`. For `packages/mcp`, `VERSION` in `src/server.ts`
has to match, because it is what clients see in the MCP initialize handshake; a test fails if the two
drift, so you will know.

```bash
cd packages/mcp
bun pm pack                       # inspect the tarball before it is public
tar -tzf open-deltat-mcp-*.tgz    # dist/, README.md, server.json, package.json and nothing else
rm open-deltat-mcp-*.tgz
bun publish
```

Check the packed `package.json` has no `workspace:` ranges left in it:

```bash
tar -xzOf open-deltat-mcp-*.tgz package/package.json | grep workspace
```

That should print nothing. `bun pm pack` and `bun publish` rewrite `workspace:*` to the workspace
package's real version, but a `workspace:` range reaching npm would make the published package
uninstallable, so it is worth the ten seconds.

Then confirm the thing people will actually run works:

```bash
cd /tmp && npx -y @open-deltat/mcp
```

With no `DELTAT_PASSWORD` set it should exit non-zero and tell you to set one. That proves the bin
resolved, the shebang survived, and dependencies installed.

## Submitting to the MCP registry

One time only. After that, a version bump is just a re-publish.

```bash
brew install mcp-publisher          # or see modelcontextprotocol.io/registry
cd packages/mcp
mcp-publisher login github          # opens a browser, authorizes the open-deltat org
mcp-publisher publish
```

The server name `io.github.open-deltat/deltat` is namespaced to the GitHub org, which is why the
login has to be against an account with access to it. Ownership is proven by that login plus the
`mcpName` field in the published npm package, so **publish to npm first**: the registry verifies the
npm package claims the same name back.

`registry.modelcontextprotocol.io` is the upstream that Smithery, PulseMCP and mcp.so pull from, so
one submission propagates without separate accounts on each.

Keep `server.json`'s `version` and the `packages[0].version` in step with `package.json`. They are
independent fields and nothing enforces it.

## After a release

- Claude connector directory and ChatGPT apps are separate manual submissions, not fed by the MCP
  registry.
- If the deltat kernel it talks to gained a capability the tools should expose, the tool
  descriptions are the thing to update. They are the routing signal a model picks on, not
  documentation, so treat a stale description as a bug rather than a docs chore.
