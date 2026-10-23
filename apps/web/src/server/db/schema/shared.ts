import { sql } from "drizzle-orm";

export function sqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));
}
