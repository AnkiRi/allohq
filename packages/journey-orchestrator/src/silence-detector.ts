import { prisma } from "@allohq/database";
import type { JourneyStep } from "./types";

const DEFAULT_SILENCE_THRESHOLD = 3; // suppress after 3 unresponded touches

/**
 * Check if a customer has gone silent in a journey
 * (no opens or clicks after N consecutive touchpoints).
 *
 * Returns true if journey should be suppressed.
 */
export async function checkSilence(
  _customerId: string,
  journeyId: string,
  threshold?: number,
): Promise<{ silent: boolean; unrespondedCount: number }> {
  const journey = await prisma.customerJourney.findUnique({
    where: { id: journeyId },
    select: { stepHistory: true },
  });

  if (!journey) {
    return { silent: false, unrespondedCount: 0 };
  }

  const steps = (journey.stepHistory ?? []) as unknown as JourneyStep[];
  const limit = threshold ?? DEFAULT_SILENCE_THRESHOLD;

  // Count consecutive unresponded steps from the end
  let unrespondedCount = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (step.opened || step.clicked || step.converted) {
      break; // found a response, stop counting
    }
    if (step.sentAt) {
      unrespondedCount++;
    }
  }

  return {
    silent: unrespondedCount >= limit,
    unrespondedCount,
  };
}

/**
 * Suppress a journey due to silence.
 */
export async function suppressJourneyForSilence(
  journeyId: string,
  _customerId: string,
): Promise<void> {
  await prisma.customerJourney.update({
    where: { id: journeyId },
    data: {
      status: "suppressed",
      suppressedAt: new Date(),
      suppressReason: "silence",
    },
  });
}

/**
 * Check global silence across all active journeys for a customer.
 * If customer is unresponsive across multiple journeys, suppress all.
 */
export async function checkGlobalSilence(
  customerId: string,
  storeId: string,
): Promise<{ silent: boolean; activeJourneys: number; silentJourneys: number }> {
  const activeJourneys = await prisma.customerJourney.findMany({
    where: { customerId, storeId, status: "active" },
    select: { id: true, stepHistory: true },
  });

  let silentCount = 0;
  for (const journey of activeJourneys) {
    const result = await checkSilence(customerId, journey.id);
    if (result.silent) silentCount++;
  }

  return {
    silent: silentCount > 0 && silentCount === activeJourneys.length,
    activeJourneys: activeJourneys.length,
    silentJourneys: silentCount,
  };
}
