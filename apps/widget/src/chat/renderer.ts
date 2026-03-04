import type { ChatMessage } from "./connection";

/** SVG icons */
const CHAT_ICON = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>`;
const CLOSE_ICON = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
const SEND_ICON = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;

/** Escape HTML to prevent XSS */
function esc(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

/** Simple markdown-ish rendering (bold, links, line breaks) */
function renderContent(text: string): string {
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br>");
}

/**
 * Chat UI renderer — builds and manages the DOM inside a Shadow DOM host.
 */
export class ChatRenderer {
  private shadow: ShadowRoot;
  private bubble!: HTMLButtonElement;
  private window!: HTMLDivElement;
  private messagesContainer!: HTMLDivElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private typingIndicator: HTMLDivElement | null = null;
  private isOpen = false;

  public onSend: ((message: string) => void) | null = null;

  constructor(shadow: ShadowRoot) {
    this.shadow = shadow;
  }

  /** Build the initial DOM structure */
  build(storeName?: string) {
    // Chat bubble
    this.bubble = document.createElement("button");
    this.bubble.className = "allo-bubble";
    this.bubble.innerHTML = CHAT_ICON;
    this.bubble.addEventListener("click", () => this.toggle());

    // Chat window
    this.window = document.createElement("div");
    this.window.className = "allo-window";
    this.window.innerHTML = `
      <div class="allo-header">
        <div class="allo-header-avatar">A</div>
        <div class="allo-header-info">
          <div class="allo-header-title">${esc(storeName ?? "Store Assistant")}</div>
          <div class="allo-header-status">Online</div>
        </div>
        <button class="allo-close">${CLOSE_ICON}</button>
      </div>
      <div class="allo-messages"></div>
      <div class="allo-input-area">
        <textarea class="allo-input" placeholder="Type a message..." rows="1"></textarea>
        <button class="allo-send" disabled>${SEND_ICON}</button>
      </div>
      <div class="allo-powered">Powered by <a href="https://allohq.com" target="_blank">AlloHQ</a></div>
    `;

    this.shadow.appendChild(this.bubble);
    this.shadow.appendChild(this.window);

    // Wire up elements
    this.messagesContainer = this.window.querySelector(".allo-messages")!;
    this.input = this.window.querySelector(".allo-input")!;
    this.sendBtn = this.window.querySelector(".allo-send")!;
    const closeBtn = this.window.querySelector(".allo-close")!;

    closeBtn.addEventListener("click", () => this.toggle());

    this.input.addEventListener("input", () => {
      this.sendBtn.disabled = this.input.value.trim().length === 0;
      // Auto-resize
      this.input.style.height = "auto";
      this.input.style.height = Math.min(this.input.scrollHeight, 80) + "px";
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendBtn.addEventListener("click", () => this.handleSend());
  }

  private handleSend() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = "";
    this.input.style.height = "auto";
    this.sendBtn.disabled = true;
    this.onSend?.(text);
  }

  /** Toggle chat window open/closed */
  toggle() {
    this.isOpen = !this.isOpen;
    this.window.classList.toggle("open", this.isOpen);
    if (this.isOpen) {
      this.input.focus();
      this.scrollToBottom();
    }
  }

  /** Add a message to the chat */
  addMessage(msg: ChatMessage) {
    this.removeTyping();
    const el = document.createElement("div");
    el.className = `allo-msg ${msg.role}`;
    el.innerHTML = renderContent(msg.content);
    this.messagesContainer.appendChild(el);
    this.scrollToBottom();
  }

  /** Show typing indicator */
  showTyping() {
    if (this.typingIndicator) return;
    this.typingIndicator = document.createElement("div");
    this.typingIndicator.className = "allo-typing";
    this.typingIndicator.innerHTML = `
      <div class="allo-typing-dot"></div>
      <div class="allo-typing-dot"></div>
      <div class="allo-typing-dot"></div>
    `;
    this.messagesContainer.appendChild(this.typingIndicator);
    this.scrollToBottom();
  }

  /** Remove typing indicator */
  removeTyping() {
    if (this.typingIndicator) {
      this.typingIndicator.remove();
      this.typingIndicator = null;
    }
  }

  /** Render a product card inside a message bubble */
  addProductCard(product: {
    title: string;
    price: number;
    compareAtPrice?: number;
    imageUrl?: string;
    handle?: string;
    storeDomain?: string;
  }) {
    this.removeTyping();
    const card = document.createElement("div");
    card.className = "allo-product-card";

    const priceHtml = product.compareAtPrice && product.compareAtPrice > product.price
      ? `$${product.price.toFixed(2)} <span class="compare">$${product.compareAtPrice.toFixed(2)}</span>`
      : `$${product.price.toFixed(2)}`;

    const productUrl = product.storeDomain && product.handle
      ? `https://${product.storeDomain}/products/${product.handle}`
      : "#";

    card.innerHTML = `
      ${product.imageUrl ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.title)}">` : ""}
      <div class="allo-product-card-body">
        <div class="allo-product-card-title">${esc(product.title)}</div>
        <div class="allo-product-card-price">${priceHtml}</div>
        <a class="allo-product-card-btn" href="${esc(productUrl)}" target="_blank">View Product</a>
      </div>
    `;

    this.messagesContainer.appendChild(card);
    this.scrollToBottom();
  }

  /** Render a discount card */
  addDiscountCard(discount: { code: string; value: string }) {
    this.removeTyping();
    const card = document.createElement("div");
    card.className = "allo-discount-card";
    card.innerHTML = `
      <div class="allo-discount-card-value">${esc(discount.value)}</div>
      <div class="allo-discount-card-code">${esc(discount.code)}</div>
    `;
    this.messagesContainer.appendChild(card);
    this.scrollToBottom();
  }

  /** Set send button enabled/disabled */
  setSendEnabled(enabled: boolean) {
    this.sendBtn.disabled = !enabled || this.input.value.trim().length === 0;
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }
}
