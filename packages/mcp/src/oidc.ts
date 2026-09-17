/**
 * A vendor-neutral OIDC AuthAdapter: verifies a bearer JWT locally against an issuer's JWKS, no
 * network call per request. Nothing here names a vendor. It works with any RS256 OIDC issuer,
 * WorkOS, Rauthy, Keycloak, Auth0, by configuration alone, which is the point: the self-hostable
 * product must never depend on one hosted provider.
 *
 * Hot-path contract: verification is offline. The JWKS is cached for five minutes, refreshes are
 * single-flighted by jose, and a fetch is capped so an issuer stall cannot pin a request. During an
 * issuer outage, already-issued tokens keep verifying until they expire.
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import type { AuthAdapter, VerifiedPrincipal } from "./auth.js";

export interface OidcAdapterOptions {
  /** Where the signing keys live, e.g. `${issuer}/.well-known/jwks.json`. */
  jwksUri: string;
  /**
   * Issuers whose tokens this adapter accepts. A token's `iss` must be one of these. Usually one
   * entry; a provider that mints more than one issuer shape from a single environment (some do)
   * lists each. Never left empty: an empty set would accept a valid signature under any issuer.
   */
  trustedIssuers: readonly string[];
  /** The tenant every token from these issuers opens. One adapter instance per tenant. */
  tenant: string;
  /**
   * Expected audience. Omit until the resource is registered with the issuer (the RFC 8707 path);
   * once set, a token minted for a different audience is rejected, which a multi-tenant ring needs.
   */
  audience?: string;
  /** Scopes granted to a verified bearer until scope claims are wired. */
  scopes?: readonly string[];
}

const JWKS_CACHE_MS = 300_000;
const JWKS_TIMEOUT_MS = 5_000;

export class OidcAdapter implements AuthAdapter {
  private readonly jwks: JWTVerifyGetKey;
  private readonly trusted: ReadonlySet<string>;

  constructor(private readonly options: OidcAdapterOptions) {
    if (options.trustedIssuers.length === 0) {
      throw new Error("OidcAdapter needs at least one trusted issuer");
    }
    this.trusted = new Set(options.trustedIssuers);
    this.jwks = createRemoteJWKSet(new URL(options.jwksUri), {
      cacheMaxAge: JWKS_CACHE_MS,
      timeoutDuration: JWKS_TIMEOUT_MS,
    });
  }

  async verify(credential: string): Promise<VerifiedPrincipal | null> {
    let payload: JWTPayload;
    try {
      // Issuer is asserted below, not pinned here, so an adapter can trust more than one issuer
      // string while still binding the signature to the configured JWKS.
      ({ payload } = await jwtVerify(credential, this.jwks, {
        audience: this.options.audience,
        algorithms: ["RS256"],
      }));
    } catch {
      return null; // bad signature, wrong audience, expired, malformed: all fail closed
    }
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (typeof payload.iss !== "string" || !this.trusted.has(payload.iss)) return null;

    return {
      // (iss, sub) is the durable key, never email (one-way door 2).
      principalId: `${payload.iss}#${payload.sub}`,
      tenant: this.options.tenant,
      scopes: this.options.scopes ?? [],
      iss: payload.iss,
      sub: payload.sub,
    };
  }
}
