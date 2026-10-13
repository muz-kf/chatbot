import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { databaseUrl } from "../config";
import * as schema from "./schema";

if (!databaseUrl) {
  throw new Error("Set PSQL_STR or DATABASE_URL to connect to PostgreSQL.");
}

const client = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(client, { schema });
