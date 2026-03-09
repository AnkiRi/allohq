// Types
export type { OutreachType, ProactiveMessageInput, ProactiveMessageResult } from "./types";

// Core
export { sendProactiveMessage } from "./send-proactive";
export { selectBestChannel } from "./channel-selector";

// Features
export { processShippingUpdate } from "./shipping";
export { processRestockAlert } from "./restock";
export { processPriceDrop } from "./price-drop";
export { getRepurchaseDueCustomers } from "./repurchase";
export { checkInventoryLevels } from "./inventory-monitor";
