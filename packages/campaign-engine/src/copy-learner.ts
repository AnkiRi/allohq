/**
 * Copy Learner
 *
 * Analyses messaging patterns to determine which copy styles
 * (urgency, curiosity, social proof, etc.) perform best for a store,
 * then surfaces actionable briefs for content generation.
 */

import { prisma } from "@allohq/database";

// ---------------------------------------------------------------------------
// Pattern keyword dictionaries
// ---------------------------------------------------------------------------

const PATTERN_KEYWORDS: Record<string, string[]> = {
  urgency: [
    "limited",
    "hurry",
    "last chance",
    "ending",
    "flash",
    "today only",
    "expires",
  ],
  curiosity: [
    "secret",
    "surprise",
    "mystery",
    "discover",
    "you won't believe",
    "guess what",
  ],
  social_proof: [
    "bestselling",
    "popular",
    "everyone",
    "trending",
    "most loved",
    "#1",
  ],
  scarcity: [
    "only",
    "left",
    "selling fast",
    "almost gone",
    "low stock",
  ],
  benefit: [
    "save",
    "free",
    "bonus",
    "exclusive",
    "unlock",
    "get",
  ],
  personal: [
    "{{first_name}}",
    "just for you",
    "picked for you",
    "your",
  ],
  humor: [
    "lol",
    "haha",
    "btw",
    "ngl",
  ],
};

// ---------------------------------------------------------------------------
// Classify a subject line into patterns
// ---------------------------------------------------------------------------

function classifySubject(subject: string): string[] {
  const lower = subject.toLowerCase();
  const matched: string[] = [];

  // Check for emoji-heavy content (humor indicator)
  const emojiCount = (subject.match(/[\u{1F600}-\u{1F9FF}]/gu) ?? []).length;
  if (emojiCount >= 2) {
    matched.push("humor");
  }

  for (const [pattern, keywords] of Object.entries(PATTERN_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        if (!matched.includes(pattern)) {
          matched.push(pattern);
        }
        break;
      }
    }
  }

  return matched.length > 0 ? matched : ["unclassified"];
}

// ---------------------------------------------------------------------------
// 1. analyzeCopyPatterns — analyse message logs and build performance data
// ---------------------------------------------------------------------------

export async function analyzeCopyPatterns(storeId: string): Promise<{
  patternsFound: number;
  recordsWritten: number;
}> {
  console.log(`[copy-learner] Analyzing copy patterns for store ${storeId}`);

  // Get message logs with engagement data
  const messages = await prisma.messageLog.findMany({
    where: {
      storeId,
      channel: "email",
      status: { in: ["sent", "delivered", "opened", "clicked"] },
      sentAt: { not: null },
    },
    select: {
      id: true,
      automationId: true,
      campaignId: true,
      outcome: true,
      outcomeRevenue: true,
      openedAt: true,
      clickedAt: true,
    },
    take: 2000,
    orderBy: { sentAt: "desc" },
  });

  if (messages.length === 0) {
    console.log(`[copy-learner] No messages found for store ${storeId}`);
    return { patternsFound: 0, recordsWritten: 0 };
  }

  // Collect subject lines from linked templates/automations
  const subjectMap = new Map<string, string>(); // messageId -> subject

  // Gather unique automation/campaign IDs
  const automationIds = [...new Set(messages.map((m) => m.automationId).filter(Boolean))] as string[];
  const campaignIds = [...new Set(messages.map((m) => m.campaignId).filter(Boolean))] as string[];

  // Get automation subjects from workflow configs
  if (automationIds.length > 0) {
    const automations = await prisma.automation.findMany({
      where: { id: { in: automationIds } },
      select: { id: true, nodes: true, name: true },
    });

    const automationSubjectMap = new Map<string, string>();
    for (const auto of automations) {
      const nodes = (auto.nodes as Array<Record<string, unknown>>) ?? [];
      for (const node of nodes) {
        const nodeConfig = (node["config"] as Record<string, unknown>) ?? {};
        if (nodeConfig["subject"]) {
          automationSubjectMap.set(auto.id, nodeConfig["subject"] as string);
          break;
        }
      }
      // Fall back to automation name
      if (!automationSubjectMap.has(auto.id)) {
        automationSubjectMap.set(auto.id, auto.name);
      }
    }

    for (const msg of messages) {
      if (msg.automationId && automationSubjectMap.has(msg.automationId)) {
        subjectMap.set(msg.id, automationSubjectMap.get(msg.automationId)!);
      }
    }
  }

  // Get campaign subjects
  if (campaignIds.length > 0) {
    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true },
    });

    const campaignSubjectMap = new Map<string, string>();
    for (const camp of campaigns) {
      campaignSubjectMap.set(camp.id, camp.name);
    }

    for (const msg of messages) {
      if (msg.campaignId && campaignSubjectMap.has(msg.campaignId) && !subjectMap.has(msg.id)) {
        subjectMap.set(msg.id, campaignSubjectMap.get(msg.campaignId)!);
      }
    }
  }

  // Classify and aggregate
  const patternStats: Record<
    string,
    {
      sent: number;
      opened: number;
      clicked: number;
      converted: number;
      sampleTexts: string[];
      automationIds: Set<string>;
      campaignIds: Set<string>;
    }
  > = {};

  for (const msg of messages) {
    const subject = subjectMap.get(msg.id);
    if (!subject) continue;

    const patterns = classifySubject(subject);

    for (const pattern of patterns) {
      if (!patternStats[pattern]) {
        patternStats[pattern] = {
          sent: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
          sampleTexts: [],
          automationIds: new Set(),
          campaignIds: new Set(),
        };
      }

      const stats = patternStats[pattern]!;
      stats.sent++;
      if (msg.openedAt) stats.opened++;
      if (msg.clickedAt) stats.clicked++;
      if (msg.outcome === "converted" || (msg.outcomeRevenue && Number(msg.outcomeRevenue) > 0)) {
        stats.converted++;
      }

      if (stats.sampleTexts.length < 3 && !stats.sampleTexts.includes(subject)) {
        stats.sampleTexts.push(subject);
      }
      if (msg.automationId) stats.automationIds.add(msg.automationId);
      if (msg.campaignId) stats.campaignIds.add(msg.campaignId);
    }
  }

  // Write to CopyPerformance table
  let recordsWritten = 0;

  for (const [pattern, stats] of Object.entries(patternStats)) {
    if (pattern === "unclassified" || stats.sent < 5) continue;

    const metrics = [
      { type: "open_rate", value: stats.sent > 0 ? stats.opened / stats.sent : 0 },
      { type: "click_rate", value: stats.sent > 0 ? stats.clicked / stats.sent : 0 },
      { type: "conversion_rate", value: stats.sent > 0 ? stats.converted / stats.sent : 0 },
    ];

    for (const metric of metrics) {
      await prisma.copyPerformance.create({
        data: {
          storeId,
          category: "subject_line",
          pattern,
          sampleText: stats.sampleTexts.join(" | "),
          metricType: metric.type,
          metricValue: Math.round(metric.value * 10000) / 10000,
          sampleSize: stats.sent,
          automationId: [...stats.automationIds][0],
          campaignId: [...stats.campaignIds][0],
        },
      });
      recordsWritten++;
    }
  }

  console.log(
    `[copy-learner] Store ${storeId}: found ${Object.keys(patternStats).length} patterns, wrote ${recordsWritten} records`,
  );

  return { patternsFound: Object.keys(patternStats).length, recordsWritten };
}

// ---------------------------------------------------------------------------
// 2. getWinningPatterns — retrieve top-performing patterns per metric
// ---------------------------------------------------------------------------

export interface PatternRanking {
  pattern: string;
  metricValue: number;
  sampleSize: number;
}

export async function getWinningPatterns(storeId: string): Promise<{
  openRate: PatternRanking[];
  clickRate: PatternRanking[];
  conversionRate: PatternRanking[];
}> {
  const records = await prisma.copyPerformance.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });

  // Group by pattern + metricType, keep latest
  const latestByKey = new Map<string, typeof records[number]>();
  for (const r of records) {
    const key = `${r.pattern}:${r.metricType}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, r);
    }
  }

  const byMetric: Record<string, PatternRanking[]> = {
    open_rate: [],
    click_rate: [],
    conversion_rate: [],
  };

  for (const record of latestByKey.values()) {
    if (byMetric[record.metricType]) {
      byMetric[record.metricType]!.push({
        pattern: record.pattern,
        metricValue: record.metricValue,
        sampleSize: record.sampleSize,
      });
    }
  }

  // Sort each metric by value descending, take top 3
  for (const metric of Object.keys(byMetric)) {
    byMetric[metric]!.sort((a, b) => b.metricValue - a.metricValue);
    byMetric[metric] = byMetric[metric]!.slice(0, 3);
  }

  return {
    openRate: byMetric["open_rate"]!,
    clickRate: byMetric["click_rate"]!,
    conversionRate: byMetric["conversion_rate"]!,
  };
}

// ---------------------------------------------------------------------------
// 3. generateCopyBrief — human-readable summary of best-performing patterns
// ---------------------------------------------------------------------------

export async function generateCopyBrief(storeId: string): Promise<string> {
  const winning = await getWinningPatterns(storeId);

  if (
    winning.openRate.length === 0 &&
    winning.clickRate.length === 0 &&
    winning.conversionRate.length === 0
  ) {
    return "Not enough data to generate a copy performance brief yet. Keep sending and we'll learn what works.";
  }

  // Compute overall average for comparison
  const allRecords = await prisma.copyPerformance.findMany({
    where: { storeId },
  });

  const avgByMetric: Record<string, number> = {};
  const countByMetric: Record<string, number> = {};

  for (const r of allRecords) {
    if (!avgByMetric[r.metricType]) {
      avgByMetric[r.metricType] = 0;
      countByMetric[r.metricType] = 0;
    }
    avgByMetric[r.metricType]! += r.metricValue * r.sampleSize;
    countByMetric[r.metricType]! += r.sampleSize;
  }

  for (const metric of Object.keys(avgByMetric)) {
    avgByMetric[metric] = countByMetric[metric]! > 0
      ? avgByMetric[metric]! / countByMetric[metric]!
      : 0;
  }

  const parts: string[] = ["This store's audience responds best to:"];

  // Top open rate pattern
  if (winning.openRate.length > 0) {
    const top = winning.openRate[0]!;
    const avg = avgByMetric["open_rate"] ?? 0;
    parts.push(
      `${top.pattern} subjects (${(top.metricValue * 100).toFixed(1)}% open rate vs ${(avg * 100).toFixed(1)}% avg)`,
    );
  }

  // Top click rate pattern
  if (winning.clickRate.length > 0) {
    const top = winning.clickRate[0]!;
    const avg = avgByMetric["click_rate"] ?? 0;
    parts.push(
      `${top.pattern} CTAs (${(top.metricValue * 100).toFixed(1)}% click vs ${(avg * 100).toFixed(1)}% avg)`,
    );
  }

  // Find worst performer to suggest avoidance
  const _worstOpen = [...(winning.openRate.length > 0 ? [winning.openRate] : [])].flat(); void _worstOpen;
  if (allRecords.length > 0) {
    const allOpenPatterns = new Map<string, { total: number; count: number }>();
    for (const r of allRecords) {
      if (r.metricType !== "open_rate") continue;
      const existing = allOpenPatterns.get(r.pattern) ?? { total: 0, count: 0 };
      existing.total += r.metricValue * r.sampleSize;
      existing.count += r.sampleSize;
      allOpenPatterns.set(r.pattern, existing);
    }

    let worstPattern = "";
    let worstValue = Infinity;
    for (const [pattern, data] of allOpenPatterns) {
      const avg = data.count > 0 ? data.total / data.count : 0;
      if (avg < worstValue && data.count >= 5) {
        worstValue = avg;
        worstPattern = pattern;
      }
    }

    if (worstPattern) {
      parts.push(
        `Avoid: ${worstPattern} (${(worstValue * 100).toFixed(1)}% open rate, underperforms).`,
      );
    }
  }

  return parts.join(" ");
}
