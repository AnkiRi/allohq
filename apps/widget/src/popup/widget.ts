import type { PopupConfig, PopupWidgetConfig } from "./types";
import { POPUP_STYLES } from "./styles";
import { setupTrigger } from "./triggers";

const DISMISSED_KEY = "allo_popup_dismissed";

/**
 * Popup widget — fetches popup configs from API and displays them
 * based on trigger rules. Uses Shadow DOM for style isolation.
 */
export class PopupWidget {
  private config: PopupWidgetConfig;
  private popups: PopupConfig[] = [];
  private activePopupId: string | null = null;
  private shadow: ShadowRoot | null = null;
  private overlay: HTMLDivElement | null = null;
  private cleanups: (() => void)[] = [];

  constructor(config: PopupWidgetConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    await this.fetchPopups();
    if (this.popups.length === 0) return;
    this.createShadowHost();
    this.registerTriggers();
  }

  private async fetchPopups(): Promise<void> {
    try {
      const url = `${this.config.apiUrl}/widget/popups`;
      const res = await fetch(url, {
        headers: {
          "X-Joon-Publishable-Key": this.config.apiKey,
          Authorization: await this.config.visitorSession.authorization(),
        },
      });
      if (!res.ok) return;
      this.popups = await res.json();
    } catch (err) {
      if (this.config.debug) {
        console.error("[AlloHQ Popup] Failed to fetch popups:", err);
      }
    }
  }

  private createShadowHost(): void {
    const host = document.createElement("div");
    host.id = "allohq-popup";
    document.body.appendChild(host);
    this.shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = POPUP_STYLES;
    this.shadow.appendChild(style);

    // Create overlay (shared)
    this.overlay = document.createElement("div");
    this.overlay.className = "allo-popup-overlay";
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.hide();
    });
    this.shadow.appendChild(this.overlay);
  }

  private registerTriggers(): void {
    for (const popup of this.popups) {
      // Skip if already dismissed by user
      if (this.isDismissed(popup.popupId)) continue;

      const cleanup = setupTrigger(
        popup.trigger,
        popup.triggerConfig,
        () => this.show(popup)
      );
      this.cleanups.push(cleanup);
    }
  }

  private show(popup: PopupConfig): void {
    if (this.activePopupId || !this.overlay || !this.shadow) return;
    this.activePopupId = popup.popupId;

    // Apply position class
    const posClass = popup.styling.position
      ? `pos-${popup.styling.position}`
      : "";
    const animClass = popup.styling.animation
      ? `anim-${popup.styling.animation}`
      : "";

    this.overlay.className = `allo-popup-overlay ${posClass} ${animClass}`;

    // Set overlay color
    if (popup.styling.overlayColor) {
      this.overlay.style.backgroundColor = popup.styling.overlayColor;
    } else {
      this.overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
    }

    // Build popup container
    const container = document.createElement("div");
    container.className = "allo-popup-container";
    if (popup.styling.width) {
      container.style.maxWidth = popup.styling.width;
    }

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "allo-popup-close";
    closeBtn.innerHTML = "&#x2715;";
    closeBtn.addEventListener("click", () => this.hide());
    container.appendChild(closeBtn);

    // Form content
    const body = document.createElement("div");
    body.className = "allo-popup-body";

    // Inject form CSS
    const formStyle = document.createElement("style");
    formStyle.textContent = popup.formCss;
    body.appendChild(formStyle);

    // Inject form HTML
    body.innerHTML += popup.formHtml;
    container.appendChild(body);

    // Clear overlay and add container
    this.overlay.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = POPUP_STYLES;
    this.overlay.appendChild(style);
    this.overlay.appendChild(container);

    // Handle form submission
    const form = container.querySelector("form[data-allo-form]");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSubmit(popup.popupId, form as HTMLFormElement, container);
      });
    }

    // Show with animation
    requestAnimationFrame(() => {
      this.overlay!.classList.add("visible");
    });

    // Track view
    this.trackEvent("popup_view", { popupId: popup.popupId });

    if (this.config.debug) {
      console.log("[AlloHQ Popup] Showing popup:", popup.popupId);
    }
  }

  private hide(): void {
    if (!this.overlay || !this.activePopupId) return;

    // Mark as dismissed
    this.setDismissed(this.activePopupId);

    this.overlay.classList.remove("visible");
    this.activePopupId = null;

    // Clean up after animation
    setTimeout(() => {
      if (this.overlay) {
        this.overlay.innerHTML = "";
      }
    }, 300);
  }

  private async handleSubmit(
    popupId: string,
    form: HTMLFormElement,
    container: HTMLDivElement
  ): Promise<void> {
    const formData = new FormData(form);
    const data: Record<string, string> = {};
    formData.forEach((value, key) => {
      data[key] = value.toString();
    });

    try {
      const res = await fetch(`${this.config.apiUrl}/widget/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Joon-Publishable-Key": this.config.apiKey,
          Authorization: await this.config.visitorSession.authorization(),
        },
        body: JSON.stringify({
          popupId,
          data,
          source: "popup",
        }),
      });

      const result = await res.json();

      // Show success state
      const body = container.querySelector(".allo-popup-body");
      if (body) {
        let successHtml = `<div class="allo-popup-success">
          <h3>Thank you!</h3>
          <p>You've been successfully subscribed.</p>`;

        if (result.discountCode) {
          successHtml += `<div class="allo-popup-discount">${result.discountCode}</div>
          <p style="margin-top:8px;font-size:12px;color:#666">Use this code at checkout</p>`;
        }

        successHtml += `</div>`;
        body.innerHTML = successHtml;
      }

      // Track submission
      this.trackEvent("form_submit", { popupId, email: data["email"] });

      // Auto-hide after 3 seconds
      setTimeout(() => this.hide(), 3000);
    } catch (err) {
      if (this.config.debug) {
        console.error("[AlloHQ Popup] Submit failed:", err);
      }
    }
  }

  private async trackEvent(type: string, data: Record<string, unknown>): Promise<void> {
    fetch(`${this.config.apiUrl}/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Joon-Publishable-Key": this.config.apiKey,
        Authorization: await this.config.visitorSession.authorization(),
      },
      body: JSON.stringify({
        type,
        data: { ...data, visitorId: this.config.visitorSession.visitorId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }

  private isDismissed(popupId: string): boolean {
    try {
      const dismissed = JSON.parse(
        sessionStorage.getItem(DISMISSED_KEY) ?? "[]"
      );
      return Array.isArray(dismissed) && dismissed.includes(popupId);
    } catch {
      return false;
    }
  }

  private setDismissed(popupId: string): void {
    try {
      const dismissed = JSON.parse(
        sessionStorage.getItem(DISMISSED_KEY) ?? "[]"
      );
      if (!dismissed.includes(popupId)) {
        dismissed.push(popupId);
        sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
      }
    } catch {
      // sessionStorage unavailable
    }
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    const host = document.getElementById("allohq-popup");
    if (host) host.remove();
  }
}
