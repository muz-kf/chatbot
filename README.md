# DAZZ

DAZZ is a React AI chat interface with switchable Neon Purple, Neon Green, Cloud White, and Midnight Gold themes. The frontend is built with Vite and uses TanStack Query for API reads and mutations. Assistant responses stream as newline-delimited JSON so tokens can appear as they are generated.

The API is built with FastAPI. PostgreSQL access uses Psycopg with parameterized SQL; the existing `users`, `email_verification_codes`, and `public_chats` tables are retained without an ORM. The OpenRouter API key stays on the server.

## Setup

1. Install Node.js 20 or newer and Python 3.12 or newer.
2. Create and activate a Python virtual environment, then install the API dependencies with `pip install -r requirements.txt`.
3. Configure `.env` with `OPENROUTER_API_KEY`, `PSQL_STR` (or `DATABASE_URL`), `SESSION_SECRET`, `RESEND_API_KEY`, and a verified `RESEND_FROM_EMAIL`. `SESSION_SECRET` must be at least 32 characters. `OPENROUTER_MODEL` defaults to `openrouter/free`; attachments use `OPENROUTER_MULTIMODAL_MODEL`, which defaults to `google/gemini-2.5-flash`.
4. For a fresh database, apply the schema with `psql "$PSQL_STR" -f migrations/0001_initial.sql`. Existing databases created by the former Drizzle setup already have these tables and need no conversion.
5. Install frontend dependencies with `npm install`.
6. Start FastAPI and Vite together with `npm run dev`, or separately with `npm run dev:api` and `npm run dev:web`.
7. Open the Vite URL printed by the frontend (usually `http://localhost:5173`).

Vite proxies `/api` requests to FastAPI on `http://localhost:8000`. In production, build the React app with `npm run build`; FastAPI serves the generated `dist` directory when it is present. Set `APP_ENV=production` and configure `APP_ORIGIN` with the public application origin.

On first visit, DAZZ asks for a name, email, and date of birth, then verifies the email with a six-digit code sent through Resend. Codes expire after 10 minutes, are limited to five attempts, and can be requested at most once per minute and five times per hour per email. A signed, HTTP-only, SameSite cookie keeps the verified session.

For local development only, set `strict_auth=false` to skip email delivery. The app looks up the email and requires the saved date of birth to match, or creates a profile for a new email. This is not secure authentication; production always requires email verification, even if `strict_auth=false` is accidentally set.

Conversation reads and writes are scoped to the authenticated email. Each `public_chats` row represents one conversation, with its messages in the `chats` JSONB column. Uploaded binary media is not stored in PostgreSQL; history retains attachment metadata, extracted text, and transcripts. DOB is saved in the verified user's profile.

Image attachments are sent for vision analysis; PDF and DOCX files are text-extracted in the browser; video uploads are represented by three extracted frames. Audio uploads and voice recordings are converted to WAV and sent along with live speech transcripts when browser speech recognition is available. The “Voice to text” sidebar tool prints live recognition results locally and does not send them to DAZZ.

The existing Python CLI in `main.py` is retained.
