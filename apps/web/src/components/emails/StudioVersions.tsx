"use client";
import * as React from "react";
import type { EmailBlock } from "@allohq/email-builder";

export type DurableVersion = { id: string; sequence: number; source: string; note?: string | null; createdAt: string | Date; document: unknown };
type SessionVersion = { id: string; label: string; createdAt: Date; blocks: EmailBlock[]; subject: string };

export function VersionsPanel({ versions, cursor, restore, durableVersions, restoreDurable, viewDurable, restoring }: {
  versions: SessionVersion[]; cursor: number; restore: (index: number) => void;
  durableVersions: DurableVersion[]; restoreDurable: (id: string) => void;
  viewDurable: (version: DurableVersion) => void; restoring: boolean;
}) {
  return <div>
    <p className="text-[12px] leading-5 text-muted-foreground">Saved versions are retained after sending. View is read-only; Restore changes this draft, never the approved email. Identical content reuses its existing version number.</p>
    {durableVersions.length ? <><h4 className="mb-2 mt-4 text-[13px] font-medium">Saved across sessions{durableVersions.length >= 100 ? " · latest 100" : ""}</h4>
      <div className="space-y-3">{durableVersions.map((version) => <div key={version.id} className="border-b border-border pb-3">
        <div className="flex justify-between gap-2"><span className="text-[13px] font-medium">v{version.sequence} · {version.source}</span><span className="text-[11px] text-muted-foreground">{new Date(version.createdAt).toLocaleDateString()}</span></div>
        <p className="mt-1 text-[12px] text-muted-foreground">{version.note ?? "Saved email"}</p>
        <div className="mt-2 flex gap-4"><button type="button" onClick={() => viewDurable(version)} className="text-[12px] text-[#2D4F9E] underline underline-offset-2" aria-label={`View version ${version.sequence}`}>View</button>
          <button type="button" disabled={restoring} onClick={() => restoreDurable(version.id)} className="text-[12px] underline underline-offset-2 disabled:opacity-40" aria-label={`Restore version ${version.sequence}`}>Restore</button></div>
      </div>)}</div></> : null}
    <h4 className="mb-2 mt-4 text-[13px] font-medium">This session</h4>
    <div className="space-y-2">{[...versions].reverse().map((version, reverseIndex) => {
      const index = versions.length - reverseIndex - 1;
      return <button key={version.id} type="button" onClick={() => restore(index)} aria-current={index === cursor ? "true" : undefined} className="w-full rounded-lg border border-border p-2 text-left hover:bg-[#F4F2EC]">
        <span className="block text-[12px] font-medium">{version.label}</span><span className="text-[11px] text-muted-foreground">{version.blocks.length} blocks · {version.subject || "No subject"}</span>
      </button>;
    })}</div>
  </div>;
}
