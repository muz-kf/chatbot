# DAZZ

DAZZ is a React AI chat interface with switchable Neon Purple, Neon Green, Cloud White, and Midnight Gold themes. The frontend is built with Vite and uses TanStack Query for API reads and mutations. Assistant responses stream as newline-delimited JSON so tokens can appear as they are generated.

The API is built with FastAPI. The code is arranged around `api/routes` for HTTP endpoints, `api/dependencies.py` for request-scoped authentication, `schemas` for Pydantic validation/serialization, `core` for configuration and auth utilities, and `db` for SQLAlchemy models and sessions. SQLAlchemy 2.x ORM uses PostgreSQL through psycopg2. Pydantic schemas validate API data and are separate from database models. The OpenRouter API key stays on the server.

## Setup

1. Install Node.js 20 or newer and Python 3.12 or newer.
2. Create and activate a Python virtual environment, then install the API dependencies with `pip install -r requirements.txt`.
3. Configure `.env` with `OPENROUTER_API_KEY`, `PSQL_STR` (or `DATABASE_URL`), and `SESSION_SECRET`. `SESSION_SECRET` must be at least 32 characters. `OPENROUTER_MODEL` defaults to `openrouter/free`; attachments use `OPENROUTER_MULTIMODAL_MODEL`, which defaults to `google/gemini-2.5-flash`.
4. For a fresh database, apply the schema with `psql "$PSQL_STR" -f migrations/0001_initial.sql`. Existing databases created by the former Drizzle setup already have these tables and need no conversion.
5. Install frontend dependencies with `npm install`.
6. Start FastAPI and Vite together with `npm run dev`, or separately with `npm run dev:api` and `npm run dev:web`.
7. Open the Vite URL printed by the frontend (usually `http://localhost:5173`).

Vite proxies `/api` requests to FastAPI on `http://localhost:8000`. In production, build the React app with `npm run build`; FastAPI serves the generated `dist` directory when it is present. Set `APP_ENV=production` and configure `APP_ORIGIN` with the public application origin.

`GET /health` returns a UTC server timestamp and a short randomly generated health message. API mutations accept same-origin requests plus configured and local development origins.

Sign-in uses the submitted email and date of birth to find the user's account; a new account is created when the email has not been seen before. The server issues a signed, HTTP-only, SameSite cookie. No email is sent and there is no email verification code in this flow. Date of birth is not a strong authentication factor; use Keycloak or another proper identity provider before exposing this flow to production users.

Conversation reads and writes are scoped to the authenticated email. Each `public_chats` row represents one conversation, with its messages in the `chats` JSONB column. Uploaded binary media is not stored in PostgreSQL; history retains attachment metadata, extracted text, and transcripts. DOB is saved in the verified user's profile.

Image attachments are sent for vision analysis; PDF and DOCX files are text-extracted in the browser; video uploads are represented by three extracted frames. Audio uploads and voice recordings are converted to WAV and sent along with live speech transcripts when browser speech recognition is available. The “Voice to text” sidebar tool prints live recognition results locally and does not send them to DAZZ.

The existing Python CLI in `main.py` is retained.
