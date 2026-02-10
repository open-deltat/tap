"use server";

import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { createSession, deleteSession } from "@/lib/auth";

export async function login(_prev: { error: string } | null, formData: FormData) {
  const user = formData.get("username") as string;
  const pass = formData.get("password") as string;

  if (user !== config.user || pass !== config.pass) {
    return { error: "Invalid credentials" };
  }

  await createSession();
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
