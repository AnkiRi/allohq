export function findBannedTerms(content: unknown, bannedTerms: string[]): string[] {
  const haystack = typeof content === "string" ? content : JSON.stringify(content ?? "");
  const normalized = haystack.toLocaleLowerCase();
  return [...new Set(bannedTerms.map((term) => term.trim()).filter(Boolean))].filter((term) =>
    normalized.includes(term.toLocaleLowerCase()),
  );
}
