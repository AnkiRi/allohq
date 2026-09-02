interface VisitorTokenResponse {
  token: string;
  expiresAt: number;
}

export function getOrCreateVisitorId(): string {
  const key = "allohq_visitor_id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = `v_${crypto.randomUUID()}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `v_${crypto.randomUUID()}`;
  }
}

/** Caches the short-lived, store/origin/visitor-bound browser credential. */
export class VisitorSession {
  readonly visitorId = getOrCreateVisitorId();
  private token: string | null = null;
  private expiresAt = 0;
  private pending: Promise<string> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
  ) {}

  async authorization(): Promise<string> {
    if (this.token && this.expiresAt > Math.floor(Date.now() / 1_000) + 30) {
      return `Bearer ${this.token}`;
    }
    if (!this.pending) this.pending = this.refresh();
    try {
      return `Bearer ${await this.pending}`;
    } finally {
      this.pending = null;
    }
  }

  private async refresh(): Promise<string> {
    const response = await fetch(`${this.apiUrl}/v1/visitor-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Joon-Publishable-Key": this.apiKey,
      },
      body: JSON.stringify({ visitorId: this.visitorId }),
    });
    if (!response.ok) throw new Error(`Visitor authentication failed: ${response.status}`);
    const issued = (await response.json()) as VisitorTokenResponse;
    this.token = issued.token;
    this.expiresAt = issued.expiresAt;
    return issued.token;
  }
}
