import OpenAI from "openai";
import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12_000),
});

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});

export type ChatMessage = z.infer<typeof messageSchema>;

export async function* streamChatResponse(
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing from the server environment.");
  }

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "DAZZ",
    },
  });
  const model = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a helpful personal AI assistant." },
        ...messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      if (signal.aborted) return;
      const content = chunk.choices[0]?.delta.content;
      if (typeof content === "string" && content.length > 0) {
        yield content;
      }
    }
  } catch (error) {
    if (signal.aborted) return;
    console.error("OpenRouter chat stream failed:", error);
    throw new Error("The assistant could not complete this response. Please try again.", {
      cause: error,
    });
  }
}
