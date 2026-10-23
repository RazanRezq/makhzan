import { z } from "zod";

const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  });

export function parseDatabaseUrl(value: string | undefined) {
  const result = databaseUrlSchema.safeParse(value);
  if (!result.success) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  return result.data;
}
