import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";

type D1Binding = ConstructorParameters<typeof PrismaD1>[0];
type CloudflareEnvWithDb = {
  DB?: D1Binding | null;
};

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function getLocalDb() {
  const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}

export const getDb = cache(() => {
  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as CloudflareEnvWithDb;

    if (runtimeEnv.DB) {
      const adapter = new PrismaD1(runtimeEnv.DB);
      return new PrismaClient({ adapter });
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error("Failed to access Cloudflare D1 binding", error);
      throw error;
    }
    // Fall back to the local SQLite client during regular Node.js development/builds.
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Cloudflare D1 binding DB is not available");
  }

  return getLocalDb();
});

export async function getDbAsync() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const runtimeEnv = env as CloudflareEnvWithDb;

    if (runtimeEnv.DB) {
      const adapter = new PrismaD1(runtimeEnv.DB);
      return new PrismaClient({ adapter });
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error("Failed to access Cloudflare D1 binding", error);
      throw error;
    }
    // Fall back to the local SQLite client during regular Node.js development/builds.
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Cloudflare D1 binding DB is not available");
  }

  return getLocalDb();
}
