import { initializeStorage } from "./storage.js?v=fe539d70";
import { scenarios, heroes } from "./cards.js?v=868baff9";
import { renderTable } from "./tracker.js?v=85a7a0ce";

await initializeStorage();
renderTable(scenarios, heroes);
