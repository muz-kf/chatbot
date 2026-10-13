import "dotenv/config";
import express from "express";
import { chatRequestSchema, streamChatResponse } from "./router";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(express.json({ limit: "1mb" }));

app.post("/api/chat", async (request, response) => {
  const parsedRequest = chatRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: "Invalid chat messages." });
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    response.status(500).json({ error: "OPENROUTER_API_KEY is missing from the server environment." });
    return;
  }

  const controller = new AbortController();
  response.on("close", () => controller.abort());
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Accel-Buffering", "no");

  try {
    for await (const token of streamChatResponse(parsedRequest.data.messages, controller.signal)) {
      response.write(`${JSON.stringify({ token })}\n`);
    }
    if (!controller.signal.aborted) {
      response.end(`${JSON.stringify({ done: true })}\n`);
    }
  } catch (error) {
    console.error("Chat request failed:", error);
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

app.listen(port, () => {
  console.log(`Chat server listening on http://localhost:${port}`);
});
