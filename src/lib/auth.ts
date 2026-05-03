import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OPERATOR_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";

const DEFAULT_SECRET = "tablecapture-admin-secret";
const DEFAULT_PASSWORD = "demo1234";

type PlatformRole = "PLATFORM_OWNER" | "PLATFORM_ADMIN";

type PlatformUserRecord = {
  id: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  passwordHash: string;
  isActive: boolean;
};

type SessionRecord = {
  token: string;
  userId: string;
  expiresAt: Date;
  user: PlatformUserRecord;
};

type AuthRepository = {
  platformUser: {
    count: () => Promise<number>;
    findUnique: (args: { where: { email?: string; id?: string } }) => Promise<PlatformUserRecord | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<PlatformUserRecord>;
    findMany: (args?: unknown) => Promise<PlatformUserRecord[]>;
  };
  platformSession: {
    create: (args: { data: Record<string, unknown> }) => Promise<SessionRecord>;
    findUnique: (args: { where: { token: string }; include?: { user: boolean } }) => Promise<SessionRecord | null>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  };
};

function repo() {
  return prisma as unknown as AuthRepository;
}

function sessionSecret() {
  return process.env.SESSION_SECRET ?? DEFAULT_SECRET;
}

function hashPassword(password: string) {
  const salt = sessionSecret();
  return scryptSync(password, salt, 32).toString("hex");
}

function passwordsMatch(password: string, passwordHash: string) {
  const hashed = Buffer.from(hashPassword(password), "hex");
  const stored = Buffer.from(passwordHash, "hex");
  if (hashed.length !== stored.length) return false;
  return timingSafeEqual(hashed, stored);
}

export async function ensurePlatformUsersSeeded() {
  const seedUsers = [
    {
      email: "owner@getayana.com",
      fullName: "Platform Owner",
      role: "PLATFORM_OWNER" as const,
    },
    {
      email: "ops@getayana.com",
      fullName: "Operations Admin",
      role: "PLATFORM_OWNER" as const,
    },
  ];

  for (const user of seedUsers) {
    await prisma.platformUser.upsert({
      where: { email: user.email },
      update: {},
      create: {
        ...user,
        passwordHash: hashPassword(DEFAULT_PASSWORD),
        isActive: true,
      },
    });
  }
}

export async function listPlatformUsers() {
  await ensurePlatformUsersSeeded();
  const users = await repo().platformUser.findMany({
    orderBy: [{ createdAt: "asc" }],
  });
  return users;
}

export async function createPlatformUser(input: {
  email: string;
  fullName: string;
  role: PlatformRole;
  password: string;
  actorUserId?: string;
}) {
  const user = await repo().platformUser.create({
    data: {
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      role: input.role,
      passwordHash: hashPassword(input.password),
      isActive: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      entityType: "platform_user",
      entityId: user.id,
      action: "platform_user.created",
      summary: `Created platform user ${user.fullName}.`,
    },
  });
}

export async function getLoginDefaults() {
  await ensurePlatformUsersSeeded();
  return {
    email: "owner@getayana.com",
    password: DEFAULT_PASSWORD,
  };
}

export async function authenticate(email: string, password: string) {
  await ensurePlatformUsersSeeded();
  const user = await repo().platformUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive) return null;
  if (!passwordsMatch(password, user.passwordHash)) return null;
  return user;
}

export async function createSession(userId: string) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  await repo().platformSession.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  const operatorToken = cookieStore.get(OPERATOR_SESSION_COOKIE)?.value;
  if (operatorToken) {
    await (prisma as unknown as AuthRepository & {
      venueSession: { deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown> };
    }).venueSession.deleteMany({
      where: { token: operatorToken },
    });
  }
  cookieStore.delete(OPERATOR_SESSION_COOKIE);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await repo().platformSession.deleteMany({
      where: { token },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  await ensurePlatformUsersSeeded();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await repo().platformSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await repo().platformSession.deleteMany({ where: { token } });
    return null;
  }
  if (!session.user.isActive) return null;

  return session.user;
}

export async function requirePlatformUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/system");
  }
  return user;
}
