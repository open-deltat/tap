import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { config } from "./config";

const COOKIE_NAME = "cal_session";

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
  if (sig !== expected) return null;
  return JSON.parse(data) as SessionPayload;
}

export async function createSession() {
  const token = sign({ user: config.user, iat: Date.now() });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function deleteSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function verifySession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verify(token) !== null;
}
