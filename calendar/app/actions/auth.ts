"use server";

import { redirect } from "next/navigation";
import { config, assertProductionSecrets } from "@/lib/config";
import { createSession, deleteSession } from "@/lib/auth";
import { credentialsMatch } from "@/lib/credentials";

export async function login(_prev: { error: string } | null, formData: FormData) {
  assertProductionSecrets();
  const user = String(formData.get("username") ?? "");
  const pass = String(formData.get("password") ?? "");

  if (!credentialsMatch(user, pass, config.user, config.pass)) {
    return { error: "Invalid credentials" };
  }

  await createSession();
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
