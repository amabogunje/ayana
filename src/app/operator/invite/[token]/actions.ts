"use server";

import { acceptOperatorInvite } from "@/lib/operator-auth";
import { redirect } from "next/navigation";

export async function acceptOperatorInviteAction(token: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) {
    redirect(`/operator/invite/${token}?error=password-match`);
  }

  try {
    await acceptOperatorInvite(token, password);
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "invite-invalid";
    redirect(`/operator/invite/${token}?error=${message}`);
  }

  redirect("/operator");
}
