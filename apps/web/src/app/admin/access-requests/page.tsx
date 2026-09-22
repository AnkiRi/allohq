import { AccessRequestsConsole } from "@/components/access/AccessRequestsConsole";

/**
 * Platform-admin review of closed-beta access requests.
 *
 * Nothing here is protected by being hard to find. Every query and mutation
 * behind it is a platform-admin procedure that answers NOT_FOUND to anyone
 * else, so a non-operator opening this page sees an empty console and can do
 * nothing with it.
 */
export default function AccessRequestsPage() {
  return <AccessRequestsConsole />;
}
