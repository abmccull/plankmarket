/** Action types recorded by the AI agent */
export type AgentActionType =
  | "offer_accepted"
  | "offer_countered"
  | "offer_rejected"
  | "listing_repriced"
  | "match_found"
  | "auto_offer_made";

/** Labels for each action type used in the UI */
export const ACTION_TYPE_LABELS: Record<AgentActionType, string> = {
  offer_accepted: "Offer Accepted",
  offer_countered: "Offer Countered",
  offer_rejected: "Offer Rejected",
  listing_repriced: "Listing Repriced",
  match_found: "Match Found",
  auto_offer_made: "Auto-Offer Made",
};

/** Descriptions for each action type used in the activity feed */
export const ACTION_TYPE_DESCRIPTIONS: Record<AgentActionType, string> = {
  offer_accepted: "Automatically accepted an incoming offer",
  offer_countered: "Sent a counter-offer to the buyer",
  offer_rejected: "Automatically rejected a low offer",
  listing_repriced: "Adjusted listing price based on repricing rules",
  match_found: "Found a new listing matching your saved search",
  auto_offer_made: "Submitted an offer on a matching listing",
};

/** Offer action types for aggregation */
export const OFFER_ACTION_TYPES: AgentActionType[] = [
  "offer_accepted",
  "offer_countered",
  "offer_rejected",
];

/** Minutes estimated per action type for time saved calculation */
export const MINUTES_PER_ACTION: Partial<Record<AgentActionType, number>> = {
  offer_accepted: 5,
  offer_countered: 5,
  offer_rejected: 5,
  match_found: 10,
  listing_repriced: 5,
  auto_offer_made: 10,
};
