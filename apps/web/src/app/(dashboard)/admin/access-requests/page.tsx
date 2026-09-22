import { AccessRequestsConsole } from "@/components/access/AccessRequestsConsole";

/**
 * Platform-admin review of closed-beta access requests.
 *
 * Inside the dashboard route group, so it carries the app's own shell, sidebar
 * and theme — an operator moving between this and the rest of Joon should not
 * feel they have left it.
 *
 * Nothing here is protected by being hard to find. Every query and mutation
 * behind it is a platform-admin procedure that answers NOT_FOUND to anyone
 * else, so a non-operator opening this page sees an empty console and can do
 * nothing with it.
 */
export default function AccessRequestsPage() {
  return <AccessRequestsConsole />;
}
