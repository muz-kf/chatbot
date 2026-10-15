CREATE TABLE IF NOT EXISTS users (
    email varchar(320) PRIMARY KEY,
    name varchar(100) NOT NULL,
    date_of_birth date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
    email varchar(320) PRIMARY KEY,
    code_hash varchar(64) NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    send_count integer NOT NULL DEFAULT 1,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_chats (
    id varchar(36) PRIMARY KEY,
    email varchar(320) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    title varchar(120) NOT NULL,
    chats jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_chats_email_updated_at_idx
    ON public_chats (email, updated_at);
