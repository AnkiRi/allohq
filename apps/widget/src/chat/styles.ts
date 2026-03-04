/** Shadow DOM CSS for the chat widget */
export const CHAT_STYLES = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1a1a1a;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.allo-bubble {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #18181b;
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  transition: transform 0.2s, box-shadow 0.2s;
  z-index: 999999;
}
.allo-bubble:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(0,0,0,0.2);
}
.allo-bubble svg { width: 24px; height: 24px; fill: currentColor; }

.allo-window {
  position: fixed;
  bottom: 88px;
  right: 20px;
  width: 380px;
  max-width: calc(100vw - 32px);
  height: 520px;
  max-height: calc(100vh - 120px);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 999998;
  opacity: 0;
  transform: translateY(16px) scale(0.96);
  pointer-events: none;
  transition: opacity 0.25s, transform 0.25s;
}
.allo-window.open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.allo-header {
  background: #18181b;
  color: #fff;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.allo-header-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}
.allo-header-info { flex: 1; }
.allo-header-title { font-weight: 600; font-size: 15px; }
.allo-header-status { font-size: 12px; opacity: 0.7; }
.allo-close {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  opacity: 0.7;
  padding: 4px;
}
.allo-close:hover { opacity: 1; }
.allo-close svg { width: 18px; height: 18px; fill: currentColor; }

.allo-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.allo-msg {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.45;
  word-wrap: break-word;
}
.allo-msg.assistant {
  align-self: flex-start;
  background: #f4f4f5;
  color: #18181b;
  border-bottom-left-radius: 4px;
}
.allo-msg.customer {
  align-self: flex-end;
  background: #18181b;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.allo-msg a {
  color: #3b82f6;
  text-decoration: underline;
}
.allo-msg strong { font-weight: 600; }

.allo-typing {
  align-self: flex-start;
  padding: 10px 14px;
  background: #f4f4f5;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  display: flex;
  gap: 4px;
  align-items: center;
}
.allo-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a1a1aa;
  animation: allo-bounce 1.2s infinite;
}
.allo-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.allo-typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes allo-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

.allo-product-card {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  overflow: hidden;
  margin-top: 8px;
}
.allo-product-card img {
  width: 100%;
  height: 140px;
  object-fit: cover;
}
.allo-product-card-body { padding: 12px; }
.allo-product-card-title { font-weight: 600; font-size: 14px; }
.allo-product-card-price {
  font-size: 16px;
  font-weight: 700;
  margin-top: 4px;
  color: #18181b;
}
.allo-product-card-price .compare {
  text-decoration: line-through;
  color: #a1a1aa;
  font-weight: 400;
  font-size: 13px;
  margin-left: 6px;
}
.allo-product-card-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  background: #18181b;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
}
.allo-product-card-btn:hover { background: #27272a; }

.allo-discount-card {
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  border: 1px dashed #22c55e;
  border-radius: 12px;
  padding: 12px;
  margin-top: 8px;
  text-align: center;
}
.allo-discount-card-value {
  font-size: 24px;
  font-weight: 700;
  color: #16a34a;
}
.allo-discount-card-code {
  font-family: monospace;
  font-size: 16px;
  font-weight: 700;
  background: #fff;
  padding: 6px 16px;
  border-radius: 6px;
  display: inline-block;
  margin-top: 6px;
  letter-spacing: 1px;
}

.allo-input-area {
  padding: 12px 16px;
  border-top: 1px solid #e4e4e7;
  display: flex;
  gap: 8px;
  align-items: center;
}
.allo-input {
  flex: 1;
  border: 1px solid #e4e4e7;
  border-radius: 24px;
  padding: 10px 16px;
  font-size: 14px;
  outline: none;
  font-family: inherit;
  resize: none;
  max-height: 80px;
  line-height: 1.4;
}
.allo-input:focus { border-color: #a1a1aa; }
.allo-input::placeholder { color: #a1a1aa; }
.allo-send {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #18181b;
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.allo-send:disabled { opacity: 0.4; cursor: not-allowed; }
.allo-send svg { width: 16px; height: 16px; fill: currentColor; }

.allo-powered {
  text-align: center;
  padding: 6px;
  font-size: 11px;
  color: #a1a1aa;
}
.allo-powered a { color: #71717a; text-decoration: none; }
.allo-powered a:hover { text-decoration: underline; }
`;
