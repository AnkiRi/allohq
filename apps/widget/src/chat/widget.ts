import { ChatConnection } from "./connection";
import { ChatRenderer } from "./renderer";
import { CHAT_STYLES } from "./styles";
import type { VisitorSession } from "../visitor-session";

export interface ChatWidgetConfig {
  apiKey: string;
  apiUrl: string;
  storeName?: string;
  storeDomain?: string;
  debug?: boolean;
  visitorSession: VisitorSession;
}

/**
 * AlloHQ Chat Widget.
 * Self-contained chat UI in a Shadow DOM with SSE-powered agent conversations.
 */
export class ChatWidget {
  private config: ChatWidgetConfig;
  private connection: ChatConnection;
  private renderer!: ChatRenderer;
  private sending = false;
  private initialized = false;

  constructor(config: ChatWidgetConfig) {
    this.config = config;
    this.connection = new ChatConnection(config.apiKey, config.apiUrl, config.visitorSession);
  }

  /** Mount the widget to the DOM */
  mount() {
    if (this.initialized) return;
    this.initialized = true;

    // Create Shadow DOM host
    const host = document.createElement("div");
    host.id = "allohq-chat";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "closed" });

    // Inject styles
    const style = document.createElement("style");
    style.textContent = CHAT_STYLES;
    shadow.appendChild(style);

    // Build UI
    this.renderer = new ChatRenderer(shadow);
    this.renderer.build(this.config.storeName);
    this.renderer.onSend = (msg) => this.handleSend(msg);

    if (this.config.debug) {
      console.log("[AlloHQ Chat] Widget mounted");
    }
  }

  /** Handle user sending a message */
  private async handleSend(text: string) {
    if (this.sending) return;
    this.sending = true;

    // Show customer message immediately
    this.renderer.addMessage({ role: "customer", content: text });

    try {
      // Ensure conversation is started
      if (!this.connection.conversationId) {
        const data = await this.connection.startConversation(this.config.visitorSession.visitorId);

        // Render any existing messages from resumed conversation
        for (const msg of data.messages) {
          this.renderer.addMessage(msg);
        }
      }

      // Send message and stream response
      await this.connection.sendMessage(text, {
        onThinking: () => {
          this.renderer.showTyping();
        },
        onToolCall: (data) => {
          if (this.config.debug) {
            console.log("[AlloHQ Chat] Tool call:", data.name, data.output);
          }
          this.handleToolCallCard(data);
        },
        onMessage: (data) => {
          this.renderer.addMessage({ role: "assistant", content: data.content });
        },
        onDone: () => {
          this.renderer.removeTyping();
          this.sending = false;
        },
        onError: (error) => {
          this.renderer.removeTyping();
          this.renderer.addMessage({
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          });
          this.sending = false;
          if (this.config.debug) {
            console.error("[AlloHQ Chat] Error:", error);
          }
        },
      });
    } catch (err) {
      this.renderer.removeTyping();
      this.renderer.addMessage({
        role: "assistant",
        content: "Sorry, I couldn't connect. Please try again.",
      });
      this.sending = false;
      if (this.config.debug) {
        console.error("[AlloHQ Chat] Connection error:", err);
      }
    }
  }

  /** Render rich cards based on tool call outputs */
  private handleToolCallCard(data: { name: string; output: unknown }) {
    const out = data.output as Record<string, unknown>;
    if (!out) return;

    if (data.name === "search_products" || data.name === "recommend_products") {
      const products = Array.isArray(out) ? out : [];
      for (const p of products.slice(0, 3)) {
        const prod = p as Record<string, unknown>;
        this.renderer.addProductCard({
          title: String(prod.title ?? ""),
          price: Number(prod.price ?? 0),
          compareAtPrice: prod.compareAtPrice ? Number(prod.compareAtPrice) : undefined,
          imageUrl: prod.imageUrl ? String(prod.imageUrl) : undefined,
          handle: prod.handle ? String(prod.handle) : undefined,
          storeDomain: this.config.storeDomain,
        });
      }
    }

    if (data.name === "create_discount_code" && out.success) {
      this.renderer.addDiscountCard({
        code: String(out.code ?? ""),
        value: String(out.description ?? ""),
      });
    }
  }

}
