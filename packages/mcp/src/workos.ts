/**
 * The OAuth AuthAdapter: verifies a bearer JWT locally against the issuer's JWKS, no network
 * call per request. The issuer is a WorkOS AuthKit domain today, but nothing here is
 * WorkOS-specific beyond the defaults: any RS256 OIDC issuer with a JWKS works, which is the
 * point (the vendor is swappable, the seam is not).
 *
 * Hot-path contract (decisions-2026-09-15 §5a): verification is offline. The JWKS is cached for
 * five minutes to match the server's own cache-control, refreshes are single-flighted by jose,
 * and a fetch is capped at five seconds so an issuer stall can never pin a booking request.
 * During an issuer outage, already-issued tokens keep verifying until they expire.
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import type { AuthAdapter, VerifiedPrincipal } from "./auth.js";

export interface WorkOSAdapterOptions {
  /** Issuer base URL, e.g. https://classic-heron-32-staging.authkit.app */
  issuer: string;
  /** The tenant every token from this issuer opens. One adapter instance per tenant. */
  tenant: string;
  /**
   * Expected audience. Omitted for now: WorkOS only stamps `aud` once resources are
   * pre-registered (the RFC 8707 path). The moment resources exist, set this: without it a
   * token minted for any consumer of this environment verifies here, which is the shared-
   * audience failure decision 10 exists to prevent on the multi-tenant ring.
   */
  audience?: string;
  /** Scopes granted to a verified bearer until scope claims are wired. */
  scopes?: readonly string[];
}

const JWKS_CACHE_MS = 300_000; // matches the server's cache-control: max-age=300
const JWKS_TIMEOUT_MS = 5_000;

export class WorkOSAdapter implements AuthAdapter {
  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(private readonly options: WorkOSAdapterOptions) {
    this.issuer = options.issuer.replace(/\/$/, "");
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/oauth2/jwks`), {
      cacheMaxAge: JWKS_CACHE_MS,
      timeoutDuration: JWKS_TIMEOUT_MS,
    });
  }

  async verify(credential: string): Promise<VerifiedPrincipal | null> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(credential, this.jwks, {
        issuer: this.issuer,
        audience: this.options.audience,
        algorithms: ["RS256"],
      }));
    } catch {
      return null; // bad signature, wrong issuer/audience, expired, malformed: all fail closed
    }
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;

    return {
      // (iss, sub) is the durable key, never email (one-way door 2).
      principalId: `${this.issuer}#${payload.sub}`,
      tenant: this.options.tenant,
      scopes: this.options.scopes ?? [],
      iss: this.issuer,
      sub: payload.sub,
    };
  }
}
