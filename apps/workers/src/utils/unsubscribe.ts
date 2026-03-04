/** Generate an unsubscribe URL for a customer */
export function getUnsubscribeUrl(customerId: string): string {
  const token = Buffer.from(customerId).toString("base64url");
  const baseUrl = process.env["API_BASE_URL"] ?? "http://localhost:3001";
  return `${baseUrl}/unsubscribe?token=${token}`;
}
