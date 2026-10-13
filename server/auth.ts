import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { Resend } from "resend";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  isProduction,
  resendApiKey,
  resendFromEmail,
  sessionSecret,
  strictAuth as configuredStrictAuth,
} from "./config";
import { db } from "./db";
import { emailVerificationCodes, users } from "./db/schema";

const router = Router();
const sessionCookieName = "dazz_session";
const codeLifetimeMs = 10 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const sendLimitWindowMs = 60 * 60 * 1000;
const maxCodeSendsPerWindow = 5;
const maxCodeAttempts = 5;
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;
function strictAuthEnabled(): boolean {
  return configuredStrictAuth !== "false" || isProduction;
}

if (configuredStrictAuth === "false" && isProduction) {
  console.warn("strict_auth=false is ignored in production; email verification remains required.");
}

const sendCodeSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const verifyCodeSchema = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().regex(/^\d{6}$/),
  name: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function sessionKey(): Uint8Array {
  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith("replace-with-a-random-secret")) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(sessionSecret);
}

function digestCode(email: string, code: string): string {
  return createHmac("sha256", sessionKey()).update(`${email}:${code}`).digest("hex");
}

function validDateOfBirth(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date <= new Date();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const profileSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function resendFailureMessage(statusCode?: number): string {
  if (statusCode === 401) {
    return "Resend rejected the API key. Check that RESEND_API_KEY is current and belongs to this Resend account.";
  }
  if (statusCode === 403) {
    return "Resend denied this request. Check the API key permissions and verify the sender domain.";
  }
  if (statusCode === 422) {
    return "Resend rejected the email details. Check that RESEND_FROM_EMAIL uses a verified sender domain.";
  }
  if (statusCode === 429) {
    return "Resend is rate-limiting requests. Wait a little and try again.";
  }
  return "Resend could not send the code. Check the sender configuration and server outbound network access.";
}

function resendStatusCode(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return undefined;
}

function setSessionCookie(response: Response, token: string): void {
  const secure = isProduction ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}${secure}`,
  );
}

export function clearSessionCookie(response: Response): void {
  const secure = isProduction ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(";")) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

export async function getAuthenticatedEmail(request: Request): Promise<string | null> {
  const token = getCookie(request, sessionCookieName);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function issueSession(response: Response, email: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${sessionLifetimeSeconds}s`)
    .sign(sessionKey());
  setSessionCookie(response, token);
}

router.get("/mode", (_request, response) => {
  response.json({ requiresEmailVerification: strictAuthEnabled() });
});

router.post("/dev-sign-in", async (request, response) => {
  if (strictAuthEnabled()) {
    response.status(404).json({ error: "Not found." });
    return;
  }
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success || !validDateOfBirth(parsed.data?.dateOfBirth ?? "")) {
    response.status(400).json({ error: "Enter a valid email, name, and date of birth." });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  await db
    .insert(users)
    .values({
      email,
      name: parsed.data.name,
      dateOfBirth: parsed.data.dateOfBirth,
    })
    .onConflictDoNothing({ target: users.email });

  const [user] = await db
    .select({ email: users.email, name: users.name, dateOfBirth: users.dateOfBirth })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.dateOfBirth !== parsed.data.dateOfBirth) {
    response.status(401).json({ error: "Authentication failed. Check your email and date of birth." });
    return;
  }

  try {
    await issueSession(response, email);
  } catch (error) {
    console.error("Could not establish DAZZ development session:", error instanceof Error ? error.message : "unknown error");
    response.status(503).json({ error: "Sign-in is temporarily unavailable." });
    return;
  }
  response.json({ user: { email: user.email, name: user.name } });
});

router.get("/session", async (request, response) => {
  const email = await getAuthenticatedEmail(request);
  if (!email) {
    clearSessionCookie(response);
    response.status(401).json({ error: "Sign-in required." });
    return;
  }
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    clearSessionCookie(response);
    response.status(401).json({ error: "Sign-in required." });
    return;
  }
  response.json({ user });
});

router.post("/send-code", async (request, response) => {
  const parsed = sendCodeSchema.safeParse(request.body);
  if (!parsed.success || !validDateOfBirth(parsed.data?.dateOfBirth ?? "")) {
    response.status(400).json({ error: "Enter a valid email, name, and date of birth." });
    return;
  }
  if (!resendApiKey || !resendFromEmail) {
    response.status(503).json({ error: "Email sign-in is not configured on the server." });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const now = new Date();
  await db
    .delete(emailVerificationCodes)
    .where(lt(emailVerificationCodes.windowStartedAt, new Date(now.getTime() - sendLimitWindowMs)));
  const [existingChallenge] = await db
    .select({
      lastSentAt: emailVerificationCodes.lastSentAt,
      sendCount: emailVerificationCodes.sendCount,
      windowStartedAt: emailVerificationCodes.windowStartedAt,
    })
    .from(emailVerificationCodes)
    .where(eq(emailVerificationCodes.email, email))
    .limit(1);
  if (existingChallenge && Date.now() - existingChallenge.lastSentAt.getTime() < resendCooldownMs) {
    response.status(429).json({ error: "Please wait a minute before requesting another code." });
    return;
  }
  if (
    existingChallenge &&
    Date.now() - existingChallenge.windowStartedAt.getTime() < sendLimitWindowMs &&
    existingChallenge.sendCount >= maxCodeSendsPerWindow
  ) {
    response.status(429).json({ error: "Too many sign-in codes requested. Try again in an hour." });
    return;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const windowStillActive = existingChallenge &&
    now.getTime() - existingChallenge.windowStartedAt.getTime() < sendLimitWindowMs;
  await db
    .insert(emailVerificationCodes)
    .values({
      email,
      codeHash: digestCode(email, code),
      attempts: 0,
      sendCount: 1,
      windowStartedAt: now,
      expiresAt: new Date(now.getTime() + codeLifetimeMs),
      lastSentAt: now,
    })
    .onConflictDoUpdate({
      target: emailVerificationCodes.email,
      set: {
        codeHash: digestCode(email, code),
        attempts: 0,
        sendCount: windowStillActive ? existingChallenge.sendCount + 1 : 1,
        windowStartedAt: windowStillActive ? existingChallenge.windowStartedAt : now,
        expiresAt: new Date(now.getTime() + codeLifetimeMs),
        lastSentAt: now,
      },
    });

  const expireChallenge = async () => {
    await db
      .update(emailVerificationCodes)
      .set({ expiresAt: new Date() })
      .where(eq(emailVerificationCodes.email, email));
  };
  const resend = new Resend(resendApiKey);
  try {
    const { error } = await resend.emails.send({
      from: resendFromEmail,
      to: email,
      subject: "Your DAZZ sign-in code",
      text: `Your DAZZ verification code is ${code}. It expires in 10 minutes.`,
    });
    if (error) {
      await expireChallenge();
      console.error("Resend rejected DAZZ sign-in email:", {
        name: error.name,
        statusCode: error.statusCode,
      });
      response.status(502).json({ error: resendFailureMessage(error.statusCode ?? undefined) });
      return;
    }
  } catch (error) {
    await expireChallenge();
    const statusCode = resendStatusCode(error);
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("Resend request failed:", { name, statusCode });
    response.status(502).json({ error: resendFailureMessage(statusCode) });
    return;
  }
  response.json({ message: "If the email can receive sign-in codes, one has been sent." });
});

router.post("/verify-code", async (request, response) => {
  const parsed = verifyCodeSchema.safeParse(request.body);
  if (!parsed.success || !validDateOfBirth(parsed.data?.dateOfBirth ?? "")) {
    response.status(400).json({ error: "Enter a valid email and six-digit code." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);

  const user = await db.transaction(async (transaction) => {
    const [challenge] = await transaction
      .select()
      .from(emailVerificationCodes)
      .where(and(eq(emailVerificationCodes.email, email), gt(emailVerificationCodes.expiresAt, new Date())))
      .for("update")
      .limit(1);
    if (!challenge || challenge.attempts >= maxCodeAttempts) return null;

    const expected = Buffer.from(challenge.codeHash, "hex");
    const provided = Buffer.from(digestCode(email, parsed.data.code), "hex");
    if (!timingSafeEqual(expected, provided)) {
      const attempts = challenge.attempts + 1;
      await transaction
        .update(emailVerificationCodes)
        .set({ attempts })
        .where(eq(emailVerificationCodes.email, email));
      return null;
    }

    const [savedUser] = await transaction
      .insert(users)
      .values({
        email,
        name: parsed.data.name,
        dateOfBirth: parsed.data.dateOfBirth,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: parsed.data.name,
          dateOfBirth: parsed.data.dateOfBirth,
          updatedAt: new Date(),
        },
      })
      .returning({ email: users.email, name: users.name });
    await transaction
      .update(emailVerificationCodes)
      .set({ attempts: maxCodeAttempts, expiresAt: new Date() })
      .where(eq(emailVerificationCodes.email, email));
    return savedUser;
  });

  if (!user) {
    response.status(400).json({ error: "That code is invalid or expired. Request a new one and try again." });
    return;
  }
  try {
    await issueSession(response, email);
  } catch (error) {
    console.error("Could not establish DAZZ session:", error instanceof Error ? error.message : "unknown error");
    response.status(503).json({ error: "Sign-in is temporarily unavailable." });
    return;
  }
  response.json({ user });
});

router.post("/logout", (_request, response) => {
  clearSessionCookie(response);
  response.status(204).end();
});

export const authRouter = router;
