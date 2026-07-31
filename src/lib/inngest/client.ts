import { EventSchemas, Inngest } from "inngest";
import type { PlankMarketEventSchemas } from "./events";

export const inngest = new Inngest({
  id: "plankmarket",
  schemas: new EventSchemas().fromRecord<PlankMarketEventSchemas>(),
});
