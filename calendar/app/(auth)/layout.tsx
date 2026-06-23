import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { NavSidebar } from "@/components/nav-sidebar";

// Every page in this group is gated on the per-request session cookie, so the group renders on
// each request and is never prerendered (prerendering would run the production-secret guard at
// build time).
export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const valid = await verifySession();
  if (!valid) redirect("/login");

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
