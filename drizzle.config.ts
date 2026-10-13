import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.PSQL_STR ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set PSQL_STR or DATABASE_URL before running Drizzle commands.");
}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
  strict: true,
  verbose: true,
});
