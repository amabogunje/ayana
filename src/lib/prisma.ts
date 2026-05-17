import dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  const databaseUrl =
    process.env.DATABASE_URL?.startsWith("file:") && process.env.DATABASE_URL_UNPOOLED
      ? process.env.DATABASE_URL_UNPOOLED
      : process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to initialize Prisma.");
  }

  if (databaseUrl.startsWith("file:")) {
    process.env.DATABASE_URL_UNPOOLED = databaseUrl;
    return new PrismaClient();
  }

  const adapter = new PrismaNeon({ connectionString: databaseUrl });

  return new PrismaClient({ adapter });
}

export const prisma = global.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}
