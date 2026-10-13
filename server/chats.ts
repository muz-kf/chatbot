import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedEmail } from "./auth";
import { db } from "./db";
import { publicChats, type StoredAttachment, type StoredMessage } from "./db/schema";
import { chatTurnRequestSchema, streamChatResponse, type ChatMessage } from "./router";

const router = Router();
const createChatSchema = z.object({ title: z.string().trim().min(1).max(120) });

function persistableMessage(message: ChatMessage): StoredMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments?.map((attachment): StoredAttachment => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      format: attachment.format,
      text: attachment.text,
      transcript: attachment.transcript,
    })),
  };
}

router.get("/", async (request, response) => {
  const email = await getAuthenticatedEmail(request);
  if (!email) {
    response.status(401).json({ error: "Sign-in required." });
    return;
  }
  const chats = await db
    .select({
      id: publicChats.id,
      title: publicChats.title,
      updatedAt: publicChats.updatedAt,
    })
    .from(publicChats)
    .where(eq(publicChats.email, email))
    .orderBy(desc(publicChats.updatedAt));
  response.json({ chats });
});

router.post("/", async (request, response) => {
  const email = await getAuthenticatedEmail(request);
  if (!email) {
    response.status(401).json({ error: "Sign-in required." });
    return;
  }
  const parsed = createChatSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A conversation title is required." });
    return;
  }
  const [chat] = await db
    .insert(publicChats)
    .values({ id: randomUUID(), email, title: parsed.data.title })
    .returning({ id: publicChats.id, title: publicChats.title, updatedAt: publicChats.updatedAt });
  response.status(201).json({ chat });
});

router.get("/:chatId", async (request, response) => {
  const email = await getAuthenticatedEmail(request);
  if (!email) {
    response.status(401).json({ error: "Sign-in required." });
    return;
  }
  const [chat] = await db
    .select({
      id: publicChats.id,
      title: publicChats.title,
      chats: publicChats.chats,
      updatedAt: publicChats.updatedAt,
    })
    .from(publicChats)
    .where(and(eq(publicChats.id, request.params.chatId), eq(publicChats.email, email)))
    .limit(1);
  if (!chat) {
    response.status(404).json({ error: "Conversation not found." });
    return;
  }
  response.json({ chat });
});

router.post("/:chatId/turns", async (request, response) => {
  const email = await getAuthenticatedEmail(request);
  if (!email) {
    response.status(401).json({ error: "Sign-in required." });
    return;
  }
  const parsed = chatTurnRequestSchema.safeParse({
    chatId: request.params.chatId,
    message: request.body?.message,
  });
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid chat message." });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    response.status(500).json({ error: "OPENROUTER_API_KEY is missing from the server environment." });
    return;
  }

  const incomingMessage = parsed.data.message;
  const persistedUserMessage = persistableMessage(incomingMessage);
  const conversation = await db.transaction(async (transaction) => {
    const [chat] = await transaction
      .select({ chats: publicChats.chats })
      .from(publicChats)
      .where(and(eq(publicChats.id, parsed.data.chatId), eq(publicChats.email, email)))
      .for("update")
      .limit(1);
    if (!chat) return null;
    const chats = [...chat.chats, persistedUserMessage];
    await transaction
      .update(publicChats)
      .set({ chats, updatedAt: new Date() })
      .where(and(eq(publicChats.id, parsed.data.chatId), eq(publicChats.email, email)));
    return chats;
  });
  if (!conversation) {
    response.status(404).json({ error: "Conversation not found." });
    return;
  }

  const currentMessages: ChatMessage[] = [
    ...conversation.slice(-40, -1),
    incomingMessage,
  ];
  const controller = new AbortController();
  response.on("close", () => controller.abort());
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Accel-Buffering", "no");

  try {
    let assistantContent = "";
    for await (const token of streamChatResponse(currentMessages, controller.signal)) {
      assistantContent += token;
      response.write(`${JSON.stringify({ token })}\n`);
    }
    if (!controller.signal.aborted) {
      await db.transaction(async (transaction) => {
        const [latest] = await transaction
          .select({ chats: publicChats.chats })
          .from(publicChats)
          .where(and(eq(publicChats.id, parsed.data.chatId), eq(publicChats.email, email)))
          .for("update")
          .limit(1);
        if (latest) {
          await transaction
            .update(publicChats)
            .set({
              chats: [...latest.chats, {
                id: randomUUID(),
                role: "assistant",
                content: assistantContent,
              }],
              updatedAt: new Date(),
            })
            .where(and(eq(publicChats.id, parsed.data.chatId), eq(publicChats.email, email)));
        }
      });
      response.end(`${JSON.stringify({ done: true })}\n`);
    }
  } catch (error) {
    console.error("Chat request failed:", error instanceof Error ? error.message : "unknown error");
    if (!controller.signal.aborted && !response.destroyed) {
      response.write(
        `${JSON.stringify({
          error: error instanceof Error ? error.message : "The assistant could not complete this response.",
        })}\n`,
      );
      response.end();
    }
  }
});

export const chatsRouter = router;
