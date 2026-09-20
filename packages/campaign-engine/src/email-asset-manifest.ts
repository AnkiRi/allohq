/**
 * Image and asset references inside an approved email's blocks, recorded on the
 * approval receipt so what was approved can be compared with what was sent.
 *
 * Moved out of the campaigns router with the rest of approval finalisation, so
 * the preparation worker can build the same receipt.
 */
export type EmailAssetReceipt = {
  blockId: string;
  blockType: string;
  field: string;
  url: string;
};


export function collectEmailAssetManifest(blocks: unknown): EmailAssetReceipt[] {
  const receipts = new Map<string, EmailAssetReceipt>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const block = value as {
      id?: unknown;
      type?: unknown;
      props?: Record<string, unknown>;
    };
    const blockId = typeof block.id === "string" ? block.id : "unknown";
    const blockType = typeof block.type === "string" ? block.type : "unknown";
    const props = block.props;
    if (props && typeof props === "object") {
      for (const field of ["src", "bgImageSrc", "logoSrc", "imageUrl", "avatarUrl"] as const) {
        const url = props[field];
        if (typeof url !== "string" || !url.trim()) continue;
        const key = `${blockId}:${field}:${url}`;
        receipts.set(key, { blockId, blockType, field, url });
      }
      const columns = props["columns"];
      if (Array.isArray(columns)) {
        for (const column of columns) {
          if (Array.isArray(column)) column.forEach(visit);
        }
      }
    }
  };
  if (Array.isArray(blocks)) blocks.forEach(visit);
  return [...receipts.values()];
}
