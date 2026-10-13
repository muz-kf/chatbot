import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./server/config";

if (!databaseUrl) {
  throw new Error("Set PSQL_STR or DATABASE_URL before running Drizzle commands.");
}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
