import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.PSQL_STR ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set PSQL_STR or DATABASE_URL to connect to PostgreSQL.");
}

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(client, { schema });
