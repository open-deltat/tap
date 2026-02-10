import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { NavSidebar } from "@/components/nav-sidebar";

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
