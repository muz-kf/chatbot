import "dotenv/config";

const configuredDatabaseUrl = process.env.PSQL_STR ?? process.env.DATABASE_URL;

export const databaseUrl = configuredDatabaseUrl?.trim() || undefined;
export const sessionSecret = process.env.SESSION_SECRET;
export const resendApiKey = process.env.RESEND_API_KEY;
export const resendFromEmail = process.env.RESEND_FROM_EMAIL;
export const openRouterApiKey = process.env.OPENROUTER_API_KEY;
export const openRouterModel = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";
export const openRouterMultimodalModel =
  process.env.OPENROUTER_MULTIMODAL_MODEL?.trim() || "google/gemini-2.5-flash";
export const strictAuth = process.env.strict_auth ?? process.env.STRICT_AUTH ?? "true";
export const isProduction = false;
//  process.env.NODE_ENV === "production";
export const serverPort = Number(process.env.PORT) || 4000;
export const appOrigin = process.env.APP_ORIGIN;
export const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
