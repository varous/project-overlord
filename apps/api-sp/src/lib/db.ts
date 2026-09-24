import { PrismaClient } from "@prisma/client";

/**
 * One client per process. connection_limit is set in DATABASE_URL rather than
 * here so it is visible to whoever reads the env - see docs/06-stack-review.md #8.
 */
export const db = new PrismaClient();
