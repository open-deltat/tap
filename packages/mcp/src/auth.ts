/**
 * The auth seam: every transport produces a VerifiedPrincipal through an AuthAdapter, and the
 * policy layer consumes only VerifiedPrincipal. This one interface is what lets the self-hosted
 * path (API key) and the hosted path (OAuth bearer) share every line of policy code (MCP-A2):
 * if policy ever imports a transport, the self-hosted path becomes the vulnerable one.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Who is calling, after verification. The only identity type policy ever sees. */
export interface VerifiedPrincipal {
  /**
   * Stable identity for attribution and rate keys. For OAuth this is `${iss}#${sub}`, the
   * (issuer, subject) pair one-way door 2 mandates, never an email. The mapping to deltat's
   * local opaque principal Ulid happens node-side, not here.
   */
  principalId: string;
  /** The tenant this credential opens. Exactly one: a key or token never spans tenants. */
  tenant: string;
  /** Granted scopes, MCP.md §S2 vocabulary: avail:read, hold:write, booking:commit, ... */
  scopes: readonly string[];
  /** OAuth issuer, absent for API keys. */
  iss?: string;
  /** OAuth subject, absent for API keys. */
  sub?: string;
}

/** A transport hands its raw credential here and gets a principal or null. Never throws. */
export interface AuthAdapter {
  verify(credential: string): Promise<VerifiedPrincipal | null>;
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Mint a new API key. 24 random bytes, base64url: same strength and shape as the public-bookable
 * manage key. Returned once; only its hash is ever stored.
 */
export function mintApiKey(): string {
  return randomBytes(24).toString("base64url");
}

/** What the server stores per key: never the key itself. */
export interface ApiKeyRecord {
  /** hex sha256 of the key */
  keyHash: string;
  principalId: string;
  tenant: string;
  scopes: readonly string[];
}

/**
 * API-key verification for the self-hosted and early-hosted rings. Constant-time comparison on
 * fixed-width digests, the pattern proven in the public-bookables manage-key flow: hashing first
 * makes both sides fixed-length, so timingSafeEqual never throws on length and leaks nothing.
 */
export class ApiKeyAdapter implements AuthAdapter {
  constructor(private readonly records: readonly ApiKeyRecord[]) {}

  async verify(credential: string): Promise<VerifiedPrincipal | null> {
    const digest = sha256(credential);
    for (const record of this.records) {
      let stored: Buffer;
      try {
        stored = Buffer.from(record.keyHash, "hex");
      } catch {
        continue; // malformed stored hash fails closed
      }
      if (stored.length !== digest.length) continue;
      if (timingSafeEqual(stored, digest)) {
        return {
          principalId: record.principalId,
          tenant: record.tenant,
          scopes: record.scopes,
        };
      }
    }
    return null;
  }
}
