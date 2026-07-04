import { cookies } from "next/headers";
import { VISITOR_COOKIE } from "./visitor";

export async function getSessionId(): Promise<string | null> {
  return (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
}
