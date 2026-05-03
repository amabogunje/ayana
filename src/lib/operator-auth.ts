import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OPERATOR_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";
import type { OperatorUser } from "@/lib/operator-types";

const DEFAULT_OPERATOR_SECRET = "tablecapture-operator-secret";
const DEFAULT_OPERATOR_PASSWORD = "demo1234";

type VenueRole = "VENUE_OWNER" | "VENUE_MANAGER" | "VENUE_AGENT";

type VenueUserRecord = {
  id: string;
  venueId: string;
  email: string;
  fullName: string;
  role: VenueRole;
  passwordHash: string;
  isActive: boolean;
  inviteAcceptedAt?: Date | null;
  venue: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    status: string;
  };
};

type VenueSessionRecord = {
  token: string;
  userId: string;
  expiresAt: Date;
  user: VenueUserRecord;
};

type VenueAuthRepository = {
  venue: {
    findMany: (args?: unknown) => Promise<
      Array<{
        id: string;
        slug: string;
        name: string;
        timezone: string;
        status: string;
        primaryOperatorName?: string | null;
        primaryOperatorEmail?: string | null;
      }>
    >;
  };
  venueUser: {
    count: () => Promise<number>;
    create: (args: { data: Record<string, unknown> }) => Promise<VenueUserRecord>;
    findFirst: (args?: { include?: { venue: boolean }; orderBy?: Array<Record<string, "asc" | "desc">> }) => Promise<VenueUserRecord | null>;
    findUnique: (args: {
      where: { email?: string; id?: string };
      include?: { venue: boolean };
    }) => Promise<VenueUserRecord | null>;
  };
  venueSession: {
    create: (args: { data: Record<string, unknown> }) => Promise<VenueSessionRecord>;
    findUnique: (args: {
      where: { token: string };
      include?: { user: { include: { venue: boolean } } };
    }) => Promise<VenueSessionRecord | null>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  };
};

function repo() {
  return prisma as unknown as VenueAuthRepository;
}

function operatorSecret() {
  return process.env.OPERATOR_SESSION_SECRET ?? process.env.SESSION_SECRET ?? DEFAULT_OPERATOR_SECRET;
}

function hashPassword(password: string) {
  return scryptSync(password, operatorSecret(), 32).toString("hex");
}

export function hashOperatorPassword(password: string) {
  return hashPassword(password);
}

function passwordsMatch(password: string, passwordHash: string) {
  const left = Buffer.from(hashPassword(password), "hex");
  const right = Buffer.from(passwordHash, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normalizeOperatorUser(user: VenueUserRecord): OperatorUser {
  return {
    id: user.id,
    venueId: user.venueId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    venue: user.venue,
  };
}

function makeSeedEmail(slug: string) {
  return `${slug.replace(/[^a-z0-9-]/gi, "")}@operators.tablecapture.local`;
}

export async function ensureVenueUsersSeeded() {
  const repository = repo();
  const count = await repository.venueUser.count();
  if (count > 0) return;

  const venues = await repository.venue.findMany({
    orderBy: [{ createdAt: "asc" }],
  });

  for (const venue of venues) {
    await repository.venueUser.create({
      data: {
        venueId: venue.id,
        email: venue.primaryOperatorEmail?.toLowerCase() || makeSeedEmail(venue.slug),
        fullName: venue.primaryOperatorName || `${venue.name} Owner`,
        role: "VENUE_OWNER",
        passwordHash: hashPassword(DEFAULT_OPERATOR_PASSWORD),
        isActive: true,
      },
    });
  }
}

export async function getOperatorLoginDefaults() {
  await ensureVenueUsersSeeded();
  const user = await repo().venueUser.findFirst({
    include: { venue: true },
    orderBy: [{ createdAt: "asc" }],
  });

  return {
    email: user?.email ?? "",
    password: DEFAULT_OPERATOR_PASSWORD,
  };
}

export async function authenticateOperator(email: string, password: string) {
  await ensureVenueUsersSeeded();
  const user = await repo().venueUser.findUnique({
    where: { email: email.toLowerCase() },
    include: { venue: true },
  });

  if (!user || !user.isActive) return null;
  if (!passwordsMatch(password, user.passwordHash)) return null;
  return normalizeOperatorUser(user);
}

export async function acceptOperatorInvite(token: string, password: string) {
  if (!token.trim()) {
    throw new Error("Invite link is invalid.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const user = await prisma.venueUser.findFirst({
    where: {
      id: token,
      isActive: true,
    },
    include: { venue: true },
  });

  if (!user) {
    throw new Error("Invite link is invalid or expired.");
  }

  const updated = await prisma.venueUser.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(password),
      isActive: true,
    },
    include: { venue: true },
  });

  await createOperatorSession(updated.id);
  return normalizeOperatorUser(updated);
}

export async function createOperatorSession(userId: string) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);

  await repo().venueSession.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  const adminToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (adminToken) {
    await (prisma as unknown as VenueAuthRepository & {
      platformSession: { deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown> };
    }).platformSession.deleteMany({
      where: { token: adminToken },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.set(OPERATOR_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return token;
}

function readBearerToken(authorizationHeader?: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

export async function getOperatorUserFromToken(token?: string | null) {
  if (!token) return null;

  await ensureVenueUsersSeeded();
  const session = await repo().venueSession.findUnique({
    where: { token },
    include: { user: { include: { venue: true } } },
  });

  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await repo().venueSession.deleteMany({ where: { token } });
    return null;
  }
  if (!session.user.isActive) return null;

  return normalizeOperatorUser(session.user);
}

export async function getCurrentOperatorUser() {
  await ensureVenueUsersSeeded();
  const cookieStore = await cookies();
  const token = cookieStore.get(OPERATOR_SESSION_COOKIE)?.value;
  return getOperatorUserFromToken(token);
}

export async function requireOperatorUser() {
  const user = await getCurrentOperatorUser();
  if (!user) {
    redirect("/operator/login");
  }
  return user;
}

export async function getOperatorUserFromRequest(request: Request) {
  const token =
    readBearerToken(request.headers.get("authorization")) ||
    (request.headers.get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${OPERATOR_SESSION_COOKIE}=`))
      ?.split("=")[1] ?? null);

  return getOperatorUserFromToken(token);
}

export async function clearOperatorSession(token?: string | null) {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(OPERATOR_SESSION_COOKIE)?.value;
  const sessionToken = token ?? cookieToken ?? null;

  if (sessionToken) {
    await repo().venueSession.deleteMany({
      where: { token: sessionToken },
    });
  }

  cookieStore.delete(OPERATOR_SESSION_COOKIE);
}
