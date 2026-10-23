import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { parseDatabaseUrl } from "./environment";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  makhzanDatabasePool?: Pool;
};

export const databasePool =
  globalDatabase.makhzanDatabasePool ??
  new Pool({
    connectionString: parseDatabaseUrl(process.env.DATABASE_URL),
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.makhzanDatabasePool = databasePool;
}

export const db = drizzle({ client: databasePool, schema });
export type Database = typeof db;
