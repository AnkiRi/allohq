export interface ChatMessage {
  id?: string;
  role: "customer" | "assistant";
  content: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

interface ConversationResponse {
  conversationId: string;
  status: string;
  messages: ChatMessage[];
}

interface SSECallbacks {
  onThinking: () => void;
  onToolCall: (data: { name: string; output: unknown }) => void;
  onMessage: (data: { content: string }) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Chat API connection manager.
 * Handles conversation creation and SSE message streaming.
 */
export class ChatConnection {
  private apiUrl: string;
  private apiKey: string;
  public conversationId: string | null = null;

  constructor(
    apiKey: string,
    apiUrl: string,
    private readonly visitorSession: VisitorSession,
  ) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  /** Start or resume a conversation */
  async startConversation(visitorId?: string): Promise<ConversationResponse> {
    const res = await fetch(`${this.apiUrl}/v1/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Joon-Publishable-Key": this.apiKey,
        Authorization: await this.visitorSession.authorization(),
      },
      body: JSON.stringify({ channel: "widget", visitorId }),
    });

    if (!res.ok) throw new Error(`Failed to start conversation: ${res.status}`);
    const data = (await res.json()) as ConversationResponse;
    this.conversationId = data.conversationId;
    return data;
  }

  /** Send a message and stream the response via SSE */
  async sendMessage(message: string, callbacks: SSECallbacks): Promise<void> {
    if (!this.conversationId) throw new Error("No active conversation");

    const res = await fetch(
      `${this.apiUrl}/v1/conversations/${this.conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Joon-Publishable-Key": this.apiKey,
          Authorization: await this.visitorSession.authorization(),
        },
        body: JSON.stringify({ message }),
      }
    );

    if (!res.ok) {
      callbacks.onError(`Request failed: ${res.status}`);
      return;
    }

    if (!res.body) {
      callbacks.onError("No response body");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const rawData = line.slice(6);
          try {
            const data = JSON.parse(rawData);
            switch (currentEvent) {
              case "thinking":
                callbacks.onThinking();
                break;
              case "tool_call":
                callbacks.onToolCall(data as { name: string; output: unknown });
                break;
              case "message":
                callbacks.onMessage(data as { content: string });
                break;
              case "error":
                callbacks.onError(data.error ?? "Unknown error");
                break;
              case "done":
                callbacks.onDone();
                break;
            }
          } catch {
            // Skip malformed JSON
          }
          currentEvent = "";
        }
      }
    }
  }
}
import type { VisitorSession } from "../visitor-session";
