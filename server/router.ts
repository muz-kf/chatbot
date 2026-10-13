import OpenAI from "openai";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12_000),
});

export const appRouter = t.router({
  chat: t.procedure
    .input(
      z.object({
        messages: z.array(messageSchema).min(1).max(40),
      }),
    )
    .subscription(async function* ({ input, signal }) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OPENROUTER_API_KEY is missing from the server environment.",
        });
      }

      const client = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        defaultHeaders: {
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "Chatbot Sample",
        },
      });
      const model = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

      try {
        const stream = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: "You are a helpful personal AI assistant." },
            ...input.messages,
          ],
          stream: true,
        });

        for await (const chunk of stream) {
          if (signal?.aborted) return;
          const content = chunk.choices[0]?.delta.content;
          if (typeof content === "string" && content.length > 0) {
            yield content;
          }
        }
      } catch (error) {
        if (signal?.aborted) return;
        console.error("OpenRouter chat stream failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The assistant could not complete this response. Please try again.",
          cause: error,
        });
      }
    }),
});

export type AppRouter = typeof appRouter;
