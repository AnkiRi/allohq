import type { GovernorDecision, GovernorCheckParams, FatigueConfig } from "./types";
import { DEFAULT_FATIGUE_CONFIG } from "./types";
import { checkFatigue } from "./fatigue-manager";
import { checkChannelCollision } from "./channel-arbitrator";
import { checkQuietHours } from "./quiet-hours";
import { checkCollision } from "./collision-detector";
import { checkSupportState } from "./support-suppressor";
import { checkCooldown } from "./cooldown-manager";

/**
 * Run all governor checks in sequence.
 * Returns the first blocking decision, or allow if all pass.
 *
 * Check order (most critical first):
 * 1. Support suppression — don't bother upset customers
 * 2. Fatigue limits — per-channel weekly/monthly caps
 * 3. Collision detection — no 2 campaigns in 48h
 * 4. Channel arbitration — no cross-channel spam within 2h
 * 5. Cooldown periods — post-discount, post-complaint
 * 6. Quiet hours — timezone-aware send windows
 */
export async function checkAllRules(
  params: GovernorCheckParams,
): Promise<GovernorDecision> {
  const { customerId, storeId, channel, messageType } = params;

  // Merchant overrides → the leaf checks (Phase 5). A per-week cap maps to the
  // channel being checked (keeps default monthly); quiet window + timezone pass
  // straight through. Absent → the checks fall back to their defaults.
  const quietCfg = params.quietHours;
  const fatigueOverride: Partial<FatigueConfig> | undefined =
    params.maxEmailsPerWeek != null
      ? ({
          [channel]: {
            weeklyMax: params.maxEmailsPerWeek,
            monthlyMax: (DEFAULT_FATIGUE_CONFIG as unknown as Record<string, { monthlyMax: number }>)[channel]?.monthlyMax ?? DEFAULT_FATIGUE_CONFIG.email.monthlyMax,
          },
        } as Partial<FatigueConfig>)
      : undefined;

  // Transactional messages only check quiet hours
  if (messageType === "transactional") {
    return checkQuietHours(params.timezone, quietCfg);
  }

  // 1. Support suppression
  const supportCheck = await checkSupportState(customerId, storeId, messageType);
  if (!supportCheck.allowed) return supportCheck;

  // 2. Fatigue limits
  const fatigueCheck = await checkFatigue(customerId, storeId, channel, fatigueOverride);
  if (!fatigueCheck.allowed) return fatigueCheck;

  // 3. Collision detection (campaigns only)
  if (params.campaignId) {
    const collisionCheck = await checkCollision(customerId, storeId);
    if (!collisionCheck.allowed) return collisionCheck;
  }

  // 4. Channel arbitration
  const channelCheck = await checkChannelCollision(customerId, storeId, channel);
  if (!channelCheck.allowed) return channelCheck;

  // 5. Cooldown periods
  const cooldownCheck = await checkCooldown(customerId, storeId, messageType);
  if (!cooldownCheck.allowed) return cooldownCheck;

  // 6. Quiet hours
  const quietCheck = checkQuietHours(params.timezone, quietCfg);
  if (!quietCheck.allowed) return quietCheck;

  return { allowed: true };
}
