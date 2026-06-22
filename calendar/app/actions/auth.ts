"use server";

import { redirect } from "next/navigation";
import { config, assertProductionSecrets } from "@/lib/config";
import { createSession, deleteSession, constantTimeEqual } from "@/lib/auth";

export async function login(_prev: { error: string } | null, formData: FormData) {
  assertProductionSecrets();
  const user = String(formData.get("username") ?? "");
  const pass = String(formData.get("password") ?? "");

  if (user !== config.user || !constantTimeEqual(pass, config.pass)) {
    return { error: "Invalid credentials" };
  }

  await createSession();
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
