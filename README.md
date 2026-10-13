# DAZZ

DAZZ is a React AI chat interface with switchable Neon Purple, Neon Green, Cloud White, and Midnight Gold themes. Each theme applies its own palette and matching font; Settings also provides additional fonts for manual selection. Theme and font choices persist between visits. Assistant replies support Markdown formatting. The UI is divided into chat components under `src/components/chat`; `App.tsx` owns conversation state and streaming.

The TypeScript server streams responses from OpenRouter over authenticated JSON requests. The API key is only read by the server; it is never sent to the browser.

## Setup

1. Install Node.js 20 or newer.
2. Configure `.env` with `OPENROUTER_API_KEY`, `PSQL_STR` (or `DATABASE_URL`), `SESSION_SECRET`, `RESEND_API_KEY`, and a verified `RESEND_FROM_EMAIL`. `SESSION_SECRET` must be at least 32 characters. `OPENROUTER_MODEL` defaults to `openrouter/free` for text chats; attachments use `OPENROUTER_MULTIMODAL_MODEL`, which defaults to `google/gemini-2.5-flash`.
3. Install dependencies with `npm install`.
4. Generate and apply the PostgreSQL migration with `npm run db:generate` and `npm run db:migrate`. Migrations are explicit and are not run automatically when the server starts.
5. Start the frontend and chat server with `npm run dev`.
6. Open the Vite URL printed by the dev server (usually `http://localhost:5173`).

On first visit, DAZZ asks for a name, email, and date of birth, then verifies the email with a six-digit code sent through Resend. Codes expire after 10 minutes, are limited to five attempts, and can be requested at most once per minute and five times per hour per email. A signed, HTTP-only, SameSite cookie keeps the verified session.

For local development only, set `strict_auth=false` to skip email delivery. The app will look up the email and require the saved date of birth to match, or create a profile for a new email. This is not secure authentication; production always requires email verification, even if `strict_auth=false` is accidentally set.

Drizzle creates `public.users`, `public.email_verification_codes`, and `public.public_chats`. `public_chats.email` references `users.email`; each row represents one conversation, with its messages in the `chats` JSONB column. Conversation reads are scoped to the authenticated email. Uploaded binary media is not stored in PostgreSQL; history retains attachment metadata, extracted text, and transcripts. DOB is saved in the verified user's profile. The database connection and Resend/OpenRouter credentials are server-only.

Image attachments are sent for vision analysis; PDF and DOCX files are text-extracted in the browser; video uploads are represented by three extracted frames. Audio uploads and voice recordings are converted to WAV and sent along with live speech transcripts when browser speech recognition is available. The “Voice to text” sidebar tool prints live recognition results locally and does not send them to DAZZ.

The existing Python CLI in `main.py` is retained. The web app uses the same OpenRouter environment variables through its TypeScript server.
