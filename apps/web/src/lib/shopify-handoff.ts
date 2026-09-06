export function shopifyHandoffReturnPath(token: string | null): string {
  if (!token || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) return "/shopify/continue";
  return `/shopify/continue?token=${encodeURIComponent(token)}`;
}
