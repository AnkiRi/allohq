import { createClerkClient } from "@clerk/backend";

export interface ClerkDisplayProfile {
  email: string | undefined;
  name: string | null;
}

export async function getClerkDisplayProfile(
  userId: string,
): Promise<ClerkDisplayProfile | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || userId.startsWith("shopify:")) return null;
  try {
    const user = await createClerkClient({ secretKey }).users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return { email: primaryEmail, name: name || null };
  } catch {
    console.warn("Clerk display profile could not be refreshed");
    return null;
  }
}

/**
 * Every email address on the Clerk account that Clerk has actually verified.
 *
 * Separate from the display profile above, which returns the primary address
 * whether or not it is verified. Accepting an invitation matches on this: an
 * unverified address is a claim, not a fact, and matching on one would let
 * anyone accept an invitation by typing in someone else's address.
 */
export async function getVerifiedClerkEmails(userId: string): Promise<string[]> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || userId.startsWith("shopify:")) return [];
  try {
    const user = await createClerkClient({ secretKey }).users.getUser(userId);
    return user.emailAddresses
      .filter((address) => address.verification?.status === "verified")
      .map((address) => address.emailAddress.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    console.warn("Clerk verified emails could not be read");
    return [];
  }
}
