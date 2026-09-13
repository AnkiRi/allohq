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
