import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export type StoredAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  format?: "wav" | "mp3";
  text?: string;
  transcript?: string;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: StoredAttachment[];
};

export const users = pgTable("users", {
  email: varchar("email", { length: 320 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const emailVerificationCodes = pgTable("email_verification_codes", {
  email: varchar("email", { length: 320 }).primaryKey(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  sendCount: integer("send_count").default(1).notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publicChats = pgTable(
  "public_chats",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 320 })
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    chats: jsonb("chats").$type<StoredMessage[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("public_chats_email_updated_at_idx").on(table.email, table.updatedAt)],
);
