import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";

// Routes the visitor from the per-request session cookie, so it renders on every request and is
// never prerendered (prerendering would run the production-secret guard at build time).
export const dynamic = "force-dynamic";

export default async function Home() {
  const valid = await verifySession();
  redirect(valid ? "/dashboard" : "/login");
}
