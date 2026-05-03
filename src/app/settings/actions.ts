"use server";

import { redirect } from "next/navigation";
import { createPlatformUser, requirePlatformUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setOpenAIApiKey, setStripeSecretKey } from "@/lib/platform-config";

export async function createPlatformUserAction(formData: FormData) {
  const actor = await requirePlatformUser();
  if (actor.role !== "PLATFORM_OWNER") {
    redirect("/settings?error=forbidden");
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "").trim() as "PLATFORM_OWNER" | "PLATFORM_ADMIN";
  const password = String(formData.get("password") ?? "").trim();

  if (!fullName || !email || !password || !role) {
    redirect("/settings?error=missing-fields");
  }

  await createPlatformUser({ fullName, email, role, password, actorUserId: actor.id });
  redirect("/settings?created=1");
}

export async function saveOpenAIKeyAction(formData: FormData) {
  const actor = await requirePlatformUser();
  if (actor.role !== "PLATFORM_OWNER") {
    redirect("/settings?configError=forbidden");
  }

  const openAIApiKey = String(formData.get("openAIApiKey") ?? "").trim();
  if (!openAIApiKey) {
    redirect("/settings?configError=missing-openai-key");
  }

  await setOpenAIApiKey(openAIApiKey);
  await prisma.activityLog.create({
    data: {
      actorUserId: actor.id,
      entityType: "platform_config",
      entityId: "platform",
      action: "platform_config.openai_api_key_saved",
      summary: "Updated the OpenAI API key configuration.",
    },
  });

  redirect("/settings?configSaved=1");
}

export async function clearOpenAIKeyAction() {
  const actor = await requirePlatformUser();
  if (actor.role !== "PLATFORM_OWNER") {
    redirect("/settings?configError=forbidden");
  }

  await setOpenAIApiKey(null);
  await prisma.activityLog.create({
    data: {
      actorUserId: actor.id,
      entityType: "platform_config",
      entityId: "platform",
      action: "platform_config.openai_api_key_cleared",
      summary: "Cleared the OpenAI API key configuration.",
    },
  });

  redirect("/settings?configCleared=1");
}

export async function saveStripeSecretKeyAction(formData: FormData) {
  const actor = await requirePlatformUser();
  if (actor.role !== "PLATFORM_OWNER") {
    redirect("/settings?stripeConfigError=forbidden");
  }

  const stripeSecretKey = String(formData.get("stripeSecretKey") ?? "").trim();
  if (!stripeSecretKey) {
    redirect("/settings?stripeConfigError=missing-stripe-key");
  }

  await setStripeSecretKey(stripeSecretKey);
  await prisma.activityLog.create({
    data: {
      actorUserId: actor.id,
      entityType: "platform_config",
      entityId: "platform",
      action: "platform_config.stripe_secret_key_saved",
      summary: "Updated the Stripe secret key configuration.",
    },
  });

  redirect("/settings?stripeConfigSaved=1");
}

export async function clearStripeSecretKeyAction() {
  const actor = await requirePlatformUser();
  if (actor.role !== "PLATFORM_OWNER") {
    redirect("/settings?stripeConfigError=forbidden");
  }

  await setStripeSecretKey(null);
  await prisma.activityLog.create({
    data: {
      actorUserId: actor.id,
      entityType: "platform_config",
      entityId: "platform",
      action: "platform_config.stripe_secret_key_cleared",
      summary: "Cleared the Stripe secret key configuration.",
    },
  });

  redirect("/settings?stripeConfigCleared=1");
}
