/**
 * Live proof of the WorkOS half of the auth seam, end to end, via the authorization-code flow
 * with PKCE, the exact flow the dashboard's redirect URI (http://localhost:3000/callback) was
 * configured for:
 *
 *   1. starts a throwaway listener on localhost:3000
 *   2. prints the authorize URL (a human signs in in the browser)
 *   3. catches the callback, exchanges the code (PKCE, no client secret)
 *   4. verifies the resulting access token OFFLINE through the same WorkOSAdapter the MCP
 *      server will use, and prints the VerifiedPrincipal
 *
 * Run from the tap repo root (so bun picks up .env.local):
 *   bun packages/mcp/scripts/workos-device-smoke.ts
 *
 * Needs WORKOS_CLIENT_ID and WORKOS_AUTHKIT_DOMAIN. Never prints tokens.
 */

import { createHash, randomBytes } from "node:crypto";

import { WorkOSAdapter } from "../src/workos.js";

const clientId = process.env.WORKOS_CLIENT_ID;
const issuer = process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/, "");
if (!clientId || !issuer) {
  console.error("missing WORKOS_CLIENT_ID or WORKOS_AUTHKIT_DOMAIN (run from tap root so .env.local loads)");
  process.exit(1);
}

// Port 3000 is often taken by the demo stack; SMOKE_PORT picks another. The chosen
// http://localhost:<port>/callback must be in the WorkOS dashboard's Redirect URIs (exact match).
const port = Number(process.env.SMOKE_PORT ?? 3000);
const redirectUri = `http://localhost:${port}/callback`;
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("base64url");

const code = await new Promise<string>((resolve, reject) => {
  const timeout = setTimeout(() => {
    server.stop(true);
    reject(new Error("no callback within 30 minutes"));
  }, 1_800_000);

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/callback") return new Response("not found", { status: 404 });
      const err = url.searchParams.get("error");
      if (err) {
        clearTimeout(timeout);
        queueMicrotask(() => server.stop(true));
        reject(new Error(`authorize error: ${err}`));
        return new Response("sign-in failed, see terminal", { status: 400 });
      }
      if (url.searchParams.get("state") !== state) {
        return new Response("state mismatch", { status: 400 });
      }
      const got = url.searchParams.get("code");
      if (!got) return new Response("missing code", { status: 400 });
      clearTimeout(timeout);
      queueMicrotask(() => server.stop(true));
      resolve(got);
      return new Response("Signed in. You can close this tab and return to the terminal.");
    },
  });

  const authorize = new URL(`${issuer}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  console.log("── sign in to approve ──");
  console.log(`open: ${authorize.href}`);
  console.log(`(waiting up to 30 minutes for the callback on localhost:${port})`);
});

const tokenRes = await fetch(`${issuer}/oauth2/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }).toString(),
});
const token = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
if (!token.access_token) {
  console.error(`token exchange failed: ${token.error} ${token.error_description ?? ""}`);
  process.exit(1);
}

console.log("code exchanged; verifying the access token offline via WorkOSAdapter...");

const adapter = new WorkOSAdapter({ issuer, tenant: "demo" });

const t0 = performance.now();
const principal = await adapter.verify(token.access_token); // first call: JWKS fetch + verify
const t1 = performance.now();
const again = await adapter.verify(token.access_token); // second call: cached JWKS, pure local verify
const t2 = performance.now();

if (!principal || !again) {
  console.error("FAIL: a freshly-issued token did not verify");
  process.exit(1);
}

console.log("── VerifiedPrincipal ──");
console.log(`principalId: ${principal.principalId}`);
console.log(`tenant:      ${principal.tenant}`);
console.log(`iss:         ${principal.iss}`);
console.log(`sub:         ${principal.sub}`);
console.log(`verify #1 (JWKS fetch + verify): ${(t1 - t0).toFixed(1)} ms`);
console.log(`verify #2 (cached, offline):     ${(t2 - t1).toFixed(3)} ms`);
console.log("OK: the WorkOS ring verifies locally; the vendor is not on the hot path.");
