# Chatbot sample

This project includes a React chat interface and a TypeScript server that streams responses from OpenRouter over a JSON `POST /api/chat` request. Assistant replies support Markdown formatting. The sidebar settings let you choose and persist the interface font. The API key is only read by the server; it is never sent to the browser.

## Setup

1. Install Node.js 20 or newer.
2. Copy `.env.sample` to `.env` and set `OPENROUTER_API_KEY` to your OpenRouter key. `OPENROUTER_MODEL` is optional and defaults to `openrouter/free`.
3. Install dependencies with `npm install`.
4. Start the frontend and tRPC server with `npm run dev`.
5. Open the Vite URL printed by the dev server (usually `http://localhost:5173`).

The existing Python CLI in `main.py` is retained. The web app uses the same OpenRouter environment variables through its TypeScript server.
