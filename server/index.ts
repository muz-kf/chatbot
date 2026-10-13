import "dotenv/config";
import express from "express";
import { authRouter } from "./auth";
import { chatsRouter } from "./chats";

const app = express();
const port = Number(process.env.PORT) || 4000;
const configuredOrigins = [
  process.env.APP_ORIGIN,
  ...(process.env.TRUSTED_ORIGINS ?? "").split(","),
]
  .map((origin) => origin?.trim())
  .filter((origin): origin is string => Boolean(origin));
const developmentOrigins = process.env.NODE_ENV === "production"
  ? []
  : ["http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = new Set(
  [...configuredOrigins, ...developmentOrigins].map((origin) => {
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error(`Invalid origin configured for APP_ORIGIN or TRUSTED_ORIGINS: ${origin}`);
    }
  }),
);

if (process.env.NODE_ENV === "production" && allowedOrigins.size === 0) {
  throw new Error("Configure APP_ORIGIN with the public DAZZ origin in production.");
}

app.disable("x-powered-by");
app.use(express.json({ limit: "32mb" }));
app.use("/api", (request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  const origin = request.get("origin");
  const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (!origin && isStateChanging) {
    response.status(403).json({ error: "An origin header is required for this request." });
    return;
  }
  let requestOrigin: string | undefined;
  if (origin) {
    try {
      requestOrigin = new URL(origin).origin;
    } catch {
      response.status(403).json({ error: "Invalid request origin." });
      return;
    }
  }
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    response.status(403).json({ error: "Cross-origin requests are not allowed." });
    return;
  }
  next();
});
app.use("/api/auth", authRouter);
app.use("/api/chats", chatsRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", error instanceof Error ? error.message : "unknown error");
  if (!response.headersSent) {
    const status = (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
    ) ? error.status : 500;
    const message = status === 413
      ? "The request is too large."
      : status === 400
        ? "The request body is invalid."
        : "The server could not complete this request.";
    response.status(status === 400 || status === 413 ? status : 500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`Chat server listening on http://localhost:${port}`);
});
