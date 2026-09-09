import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton to avoid exhausting SQLite/Postgres
// connections on hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
  globalForPrisma.prisma = undefined;
}
