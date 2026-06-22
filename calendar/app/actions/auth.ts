"use server";

import { redirect } from "next/navigation";
import { config, assertProductionSecrets } from "@/lib/config";
import { createSession, deleteSession } from "@/lib/auth";
import { constantTimeEqual } from "@/lib/crypto";

export async function login(_prev: { error: string } | null, formData: FormData) {
  assertProductionSecrets();
  const user = String(formData.get("username") ?? "");
  const pass = String(formData.get("password") ?? "");

  // Compare both fields unconditionally so timing reveals neither which field was wrong nor
  // whether the password check ran; a plain || would short-circuit the password compare.
  const userOk = constantTimeEqual(user, config.user);
  const passOk = constantTimeEqual(pass, config.pass);
  if (!userOk || !passOk) {
    return { error: "Invalid credentials" };
  }

  await createSession();
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
