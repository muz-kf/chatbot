# DAZZ

DAZZ is a React AI chat interface with switchable Neon Purple, Neon Green, Cloud White, and Midnight Gold themes. The frontend is built with Vite and uses TanStack Query for API reads and mutations. Assistant responses stream as newline-delimited JSON so tokens can appear as they are generated.

The API is built with FastAPI. The code is arranged around `api/routes` for HTTP endpoints, `api/dependencies.py` for request-scoped authentication, `schemas` for Pydantic validation/serialization, `core` for configuration and auth utilities, and `db` for SQLAlchemy models and sessions. SQLAlchemy 2.x ORM uses PostgreSQL through psycopg2. Pydantic schemas validate API data and are separate from database models. The OpenRouter API key stays on the server.

## Quick Start with Docker Compose

You can launch the entire stack (PostgreSQL DB, FastAPI Server on port 5002, and Vite/React App on port 5001) using Docker Compose:

```bash
# 1. Start all services
docker compose up -d --build

# 2. Access the services:
# - Frontend App: http://localhost:5001
# - API Server:   http://localhost:5002 (health check at http://localhost:5002/health)
# - Database:     localhost:5432
```

To stop the services:
```bash
docker compose down
```

## Setup (Local Development)

1. Install Node.js 20 or newer and Python 3.12 or newer.
2. Create and activate a Python virtual environment, then install the API dependencies with `pip install -r requirements.txt`.
3. Start the PostgreSQL database using Docker:
   ```bash
   docker compose up -d db
   ```
4. Configure `.env` with `OPENROUTER_API_KEY`, `PSQL_STR=postgresql://postgres:postgres@localhost:5432/dazz`, and `SESSION_SECRET`.
5. Install frontend dependencies with `npm install`.
6. Start FastAPI and Vite together with `npm run dev`, or separately with `npm run dev:api` (port 5002) and `npm run dev:web` (port 5001).
7. Open the app at `http://localhost:5001`.

Vite proxies `/api` requests to FastAPI on `http://127.0.0.1:5002`. In production, build the React app with `npm run build`; FastAPI serves the generated `dist` directory when it is present. Set `APP_ENV=production` and configure `APP_ORIGIN` with the public application origin.

`GET /health` returns a UTC server timestamp and a short randomly generated health message. API mutations accept same-origin requests plus configured and local development origins.

Sign-in uses the submitted email and date of birth to find the user's account; a new account is created when the email has not been seen before. The server issues a signed, HTTP-only, SameSite cookie. No email is sent and there is no email verification code in this flow. Date of birth is not a strong authentication factor; use Keycloak or another proper identity provider before exposing this flow to production users.

Conversation reads and writes are scoped to the authenticated email. Each `public_chats` row represents one conversation, with its messages in the `chats` JSONB column. Uploaded binary media is not stored in PostgreSQL; history retains attachment metadata, extracted text, and transcripts. DOB is saved in the verified user's profile.

Image attachments are sent for vision analysis; PDF and DOCX files are text-extracted in the browser; video uploads are represented by three extracted frames. Audio uploads and voice recordings are converted to WAV and sent along with live speech transcripts when browser speech recognition is available. The “Voice to text” sidebar tool prints live recognition results locally and does not send them to DAZZ.

The existing Python CLI in `main.py` is retained.
