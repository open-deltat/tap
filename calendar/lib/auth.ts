import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { config, assertProductionSecrets } from "./config";
import { constantTimeEqual } from "./crypto";

const COOKIE_NAME = "cal_session";
const MAX_SESSION_MS = 60 * 60 * 24 * 7 * 1000; // 7 days, matching the cookie maxAge

interface SessionPayload {
  user: string;
  iat: number;
}

function sign(payload: SessionPayload): string {
  const data = JSON.stringify(payload);
  const sig = createHmac("sha256", config.secret).update(data).digest("hex");
  return `${Buffer.from(data).toString("base64url")}.${sig}`;
}

function verify(token: string): SessionPayload | null {
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const data = Buffer.from(dataB64, "base64url").toString();
  const expected = createHmac("sha256", config.secret).update(data).digest("hex");
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(data) as SessionPayload;
    // Bound a leaked token's replay window server-side: the signed iat is load-bearing, not the
    // browser-enforced cookie maxAge. An expired token is rejected even if the cookie was copied.
    if (Date.now() - payload.iat > MAX_SESSION_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession() {
  const token = sign({ user: config.user, iat: Date.now() });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function deleteSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function verifySession(): Promise<boolean> {
  assertProductionSecrets();
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verify(token) !== null;
}

/**
 * Enforce authentication at the action boundary. A layout redirect only gates rendering; Server
 * Actions are independent POST endpoints, so every authenticated action must call this as its first
 * line, otherwise an unauthenticated request can invoke it directly.
 */
export async function requireSession(): Promise<void> {
  if (!(await verifySession())) {
    throw new Error("Unauthorized");
  }
}
