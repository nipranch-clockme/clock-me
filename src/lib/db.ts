import { PrismaClient } from "@prisma/client";
import { runtimeUrl } from "./dbUrl";

const makeClient = () => new PrismaClient({
  datasourceUrl: runtimeUrl(process.env.DATABASE_URL),
  // The secret in a client's report link is never read by accident: any query that returns a client leaves it out unless it asks for it by name.
  omit: { client: { shareToken: true } },
});

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
