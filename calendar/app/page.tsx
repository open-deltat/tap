import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";

export default async function Home() {
  const valid = await verifySession();
  redirect(valid ? "/dashboard" : "/login");
}
