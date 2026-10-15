export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const result = response.status === 204
    ? undefined
    : (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new ApiError(
      result?.error || "The server could not complete this request.",
      response.status,
    );
  }
  return result as T;
}

export const queryKeys = {
  session: ["session"] as const,
  chats: ["chats"] as const,
  chat: (chatId: string) => ["chats", chatId] as const,
  authMode: ["auth", "mode"] as const,
};
