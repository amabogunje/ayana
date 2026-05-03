import { prisma } from "@/lib/prisma";

const PLATFORM_CONFIG_ID = "platform";

type PlatformConfigRecord = {
  id: string;
  openAIApiKey: string | null;
  stripeSecretKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PlatformConfigRepository = {
  platformConfig: {
    findUnique: (args: { where: { id: string } }) => Promise<PlatformConfigRecord | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<PlatformConfigRecord>;
    upsert: (args: {
      where: { id: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => Promise<PlatformConfigRecord>;
  };
};

function repo() {
  return prisma as unknown as PlatformConfigRepository;
}

export async function getPlatformConfig() {
  const repository = repo();
  const existing = await repository.platformConfig.findUnique({
    where: { id: PLATFORM_CONFIG_ID },
  });

  if (existing) {
    return existing;
  }

  return repository.platformConfig.create({
    data: {
      id: PLATFORM_CONFIG_ID,
      openAIApiKey: null,
      stripeSecretKey: null,
    },
  });
}

export async function setOpenAIApiKey(openAIApiKey: string | null) {
  const repository = repo();
  return repository.platformConfig.upsert({
    where: { id: PLATFORM_CONFIG_ID },
    update: { openAIApiKey },
    create: {
      id: PLATFORM_CONFIG_ID,
      openAIApiKey,
    },
  });
}

export async function setStripeSecretKey(stripeSecretKey: string | null) {
  const repository = repo();
  return repository.platformConfig.upsert({
    where: { id: PLATFORM_CONFIG_ID },
    update: { stripeSecretKey },
    create: {
      id: PLATFORM_CONFIG_ID,
      openAIApiKey: null,
      stripeSecretKey,
    },
  });
}

export function maskApiKey(value: string | null | undefined) {
  if (!value) {
    return "Not configured";
  }

  if (value.length <= 8) {
    return "Configured";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function getResolvedOpenAIApiKey(configuredKey: string | null | undefined) {
  return configuredKey ?? process.env.OPENAI_API_KEY ?? null;
}

export function getResolvedStripeSecretKey(configuredKey: string | null | undefined) {
  return configuredKey ?? process.env.STRIPE_SECRET_KEY ?? null;
}
