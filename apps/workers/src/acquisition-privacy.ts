import type { Prisma } from "@allohq/database";

export async function redactAcquisitionEvidence(tx: Prisma.TransactionClient, customerId: string) {
  const submissions = await tx.formSubmission.findMany({ where: { customerId }, select: { id: true } });
  const submissionIds = submissions.map((row) => row.id);
  await tx.formExperimentExposure.deleteMany({ where: { submissionId: { in: submissionIds } } });
  await tx.formIncentiveGrant.deleteMany({ where: { customerId } });
  await tx.consentConfirmation.deleteMany({ where: { customerId } });
  await tx.customerTrait.deleteMany({ where: { customerId } });
  await tx.experimentOrderOutcome.deleteMany({ where: { customerId } });
  return { submissionIds };
}
