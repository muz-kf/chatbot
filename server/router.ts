import OpenAI from "openai";
import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(12_000),
  attachments: z.array(z.object({
    id: z.string().max(100),
    name: z.string().min(1).max(255),
    mimeType: z.string().max(120),
    size: z.number().int().nonnegative().max(60 * 1024 * 1024),
    data: z.string().max(16_000_000).optional(),
    format: z.enum(["wav", "mp3"]).optional(),
    text: z.string().max(180_000).optional(),
    transcript: z.string().max(12_000).optional(),
    frames: z.array(z.string().max(3_000_000)).max(3).optional(),
  })).max(6).optional(),
}).refine(
  (message) => message.role === "assistant" || message.content.trim().length > 0 || (message.attachments?.length ?? 0) > 0,
  "User messages must include text or an attachment.",
);

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});

export type ChatMessage = z.infer<typeof messageSchema>;

function toOpenRouterMessage(message: ChatMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (message.role === "assistant") {
    return { role: "assistant", content: message.content };
  }

  const attachments = message.attachments ?? [];
  if (attachments.length === 0) {
    return { role: "user", content: message.content };
  }

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  const textParts = [message.content.trim()].filter(Boolean);
  for (const attachment of attachments) {
    textParts.push(`Attached file: ${attachment.name} (${attachment.mimeType}).`);
    if (attachment.transcript) textParts.push(`Voice transcript: ${attachment.transcript}`);
    if (attachment.text) textParts.push(`Extracted text from ${attachment.name}:\n${attachment.text}`);
  }
  content.push({ type: "text", text: textParts.join("\n\n") });

  for (const attachment of attachments) {
    if (attachment.data && attachment.mimeType.startsWith("image/")) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
      });
    }
    if (attachment.data && attachment.format) {
      content.push({
        type: "input_audio",
        input_audio: { data: attachment.data, format: attachment.format },
      });
    }
    for (const [index, frame] of (attachment.frames ?? []).entries()) {
      content.push({ type: "text", text: `Video frame ${index + 1} from ${attachment.name}:` });
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${frame}` },
      });
    }
  }
  return { role: "user", content };
}

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
  const usesAttachments = messages.some((message) => (message.attachments?.length ?? 0) > 0);
  const model = usesAttachments
    ? process.env.OPENROUTER_MULTIMODAL_MODEL?.trim() || "google/gemini-2.5-flash"
    : process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a helpful personal AI assistant." },
        ...messages.map(toOpenRouterMessage),
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
