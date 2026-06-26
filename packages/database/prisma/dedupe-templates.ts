/**
 * DRY-RUN by default. Analyzes duplicate templates (per workspace, by name+body),
 * keeping the NEWEST, and reports what WOULD be deleted + whether each dup is
 * referenced (automationId / campaigns). Pass --execute to actually delete the
 * SAFE subset (unreferenced dups only).
 *   pnpm --filter @allohq/database exec tsx prisma/dedupe-templates.ts
 *   pnpm --filter @allohq/database exec tsx prisma/dedupe-templates.ts --execute
 */
import "dotenv/config";
import { prisma, DEMO_STORE_DOMAIN } from "../src/index";

const EXECUTE = process.argv.includes("--execute");

type Row = { id: string; workspaceId: string; name: string; body?: string; automationId?: string | null; createdAt: Date };

function groupDups(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.workspaceId}::${r.name}::${r.body ?? ""}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  // For each group with >1, keep the newest, the rest are dup candidates.
  const deletable: Row[] = [];
  let dupGroups = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    dupGroups++;
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    deletable.push(...arr.slice(1)); // all but the newest
  }
  return { deletable, dupGroups };
}

async function analyze(label: string, rows: Row[], hasAutomation: boolean) {
  const { deletable, dupGroups } = groupDups(rows);
  const referenced = deletable.filter((r) => hasAutomation && r.automationId);
  const unreferenced = deletable.filter((r) => !(hasAutomation && r.automationId));
  console.log(`\n${label}: total=${rows.length}, dup-groups=${dupGroups}, deletable=${deletable.length} (referenced=${referenced.length}, unreferenced=${unreferenced.length})`);
  return { unreferenced };
}

async function main() {
  const demoStore = await prisma.store.findFirst({ where: { shopDomain: DEMO_STORE_DOMAIN }, select: { workspaceId: true } });
  const demoWs = demoStore?.workspaceId;
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will delete unreferenced dups)" : "DRY-RUN (no changes)"}`);
  console.log(`Demo workspace (never touched): ${demoWs}`);

  const email = await prisma.emailTemplate.findMany({ select: { id: true, workspaceId: true, name: true, subject: true, createdAt: true } });
  const sms = await prisma.smsTemplate.findMany({ select: { id: true, workspaceId: true, name: true, body: true, automationId: true, createdAt: true } });
  const wa = await prisma.whatsAppTemplate.findMany({ select: { id: true, workspaceId: true, name: true, body: true, automationId: true, createdAt: true } });
  const rcs = await prisma.rcsTemplate.findMany({ select: { id: true, workspaceId: true, name: true, body: true, automationId: true, createdAt: true } });

  // exclude the demo workspace entirely from any deletion
  const notDemo = (r: { workspaceId: string }) => r.workspaceId !== demoWs;

  const e = await analyze("EmailTemplate", email.map((r) => ({ ...r, body: r.subject })).filter(notDemo), false);
  const s = await analyze("SmsTemplate", sms.filter(notDemo), true);
  const w = await analyze("WhatsAppTemplate", wa.filter(notDemo), true);
  const r = await analyze("RcsTemplate", rcs.filter(notDemo), true);

  const toDelete = {
    email: e.unreferenced.map((x) => x.id),
    sms: s.unreferenced.map((x) => x.id),
    wa: w.unreferenced.map((x) => x.id),
    rcs: r.unreferenced.map((x) => x.id),
  };
  const total = toDelete.email.length + toDelete.sms.length + toDelete.wa.length + toDelete.rcs.length;
  console.log(`\n==> UNREFERENCED duplicates that would be deleted: ${total}`);

  if (!EXECUTE) {
    console.log("DRY-RUN — nothing deleted. Re-run with --execute to delete the unreferenced dups above.");
    return;
  }
  if (toDelete.email.length) await prisma.emailTemplate.deleteMany({ where: { id: { in: toDelete.email } } });
  if (toDelete.sms.length) await prisma.smsTemplate.deleteMany({ where: { id: { in: toDelete.sms } } });
  if (toDelete.wa.length) await prisma.whatsAppTemplate.deleteMany({ where: { id: { in: toDelete.wa } } });
  if (toDelete.rcs.length) await prisma.rcsTemplate.deleteMany({ where: { id: { in: toDelete.rcs } } });
  console.log(`✓ Deleted ${total} unreferenced duplicate templates.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
