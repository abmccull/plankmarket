import type {
  ListingStatus,
  MaterialType,
  ConditionType,
  SortOption,
} from "@/types";
import { getPostHogServer } from "./posthog-server";
import type { SearchGapAnalyticsContext } from "@/lib/marketplace/search-gap";
import { sanitizeAnalyticsProperties } from "./privacy";

// Event property interfaces
export interface ListingViewedProperties {
  listing_id: string;
  seller_id: string;
  material_type: MaterialType;
  condition: ConditionType;
  price_per_sqft: number;
  total_sqft: number;
  lot_value: number;
  location_state: string;
}

export interface ListingCreatedProperties {
  listing_id: string;
  material_type: MaterialType;
  condition: ConditionType;
  price_per_sqft: number;
  total_sqft: number;
  status: ListingStatus;
}

export interface ListingPublishedProperties {
  listing_id: string;
  material_type: MaterialType;
  condition: ConditionType;
  price_per_sqft: number;
  total_sqft: number;
  time_to_publish_minutes: number;
}

export interface CheckoutStartedProperties {
  listing_id: string;
  seller_id: string;
  lot_value: number;
  quantity_sqft: number;
}

export interface PaymentCompletedProperties {
  listing_id: string;
  seller_id: string;
  amount: number;
  quantity_sqft: number;
  payment_method: string;
}

export interface OrderCreatedProperties {
  order_id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  total_amount: number;
  quantity_sqft: number;
}

export interface SignupCompletedProperties {
  user_id: string;
  role: "buyer" | "seller";
  signup_method: "email" | "google" | "magic_link";
}

export interface LoginCompletedProperties {
  user_id: string;
  role: "buyer" | "seller";
  login_method: "email" | "google" | "magic_link";
}

export interface SearchPerformedProperties {
  query?: string;
  material_types?: MaterialType[];
  conditions?: ConditionType[];
  price_min?: number;
  price_max?: number;
  results_count: number;
  sort_option?: SortOption;
}

export interface FilterAppliedProperties {
  filter_type: string;
  filter_values: string[];
  results_count: number;
}

export interface OfferMadeProperties {
  listing_id: string;
  seller_id: string;
  offer_amount: number;
  listed_price: number;
  discount_percentage: number;
}

export interface OfferAcceptedProperties {
  listing_id: string;
  buyer_id: string;
  offer_amount: number;
  listed_price: number;
  discount_percentage: number;
}

export interface WatchlistAddedProperties {
  listing_id: string;
  seller_id: string;
  material_type: MaterialType;
  price_per_sqft: number;
}

export interface WatchlistRemovedProperties {
  listing_id: string;
}

export interface MarketplaceZeroResultsProperties
  extends SearchGapAnalyticsContext {
  results_count: 0;
}

export interface MarketplaceZeroResultsActionProperties
  extends SearchGapAnalyticsContext {
  action:
    | "create_buyer_request"
    | "save_search_alert"
    | "list_inventory"
    | "refer_inventory";
  authenticated: boolean;
  actor_role: "buyer" | "seller" | "admin" | "anonymous";
}

export interface SavedSearchAlertCreatedProperties
  extends SearchGapAnalyticsContext {
  source: "zero_results" | "browse_toolbar";
  alert_enabled: true;
}

export interface BuyerRequestCreatedProperties {
  request_id: string;
  source: "zero_results" | "direct";
  material_types: MaterialType[];
  min_total_sqft: number;
  max_total_sqft?: number;
  price_min_per_sqft?: number;
  price_max_per_sqft: number;
  pickup_ok: boolean;
  shipping_ok: boolean;
  urgency: "asap" | "2_weeks" | "4_weeks" | "flexible";
  has_notes: boolean;
  reference_photo_count: number;
}

// Event catalog type
export type PlankMarketEvent =
  | { event: "listing_viewed"; properties: ListingViewedProperties }
  | { event: "listing_created"; properties: ListingCreatedProperties }
  | { event: "listing_published"; properties: ListingPublishedProperties }
  | { event: "checkout_started"; properties: CheckoutStartedProperties }
  | { event: "payment_completed"; properties: PaymentCompletedProperties }
  | { event: "order_created"; properties: OrderCreatedProperties }
  | { event: "signup_completed"; properties: SignupCompletedProperties }
  | { event: "login_completed"; properties: LoginCompletedProperties }
  | { event: "search_performed"; properties: SearchPerformedProperties }
  | { event: "filter_applied"; properties: FilterAppliedProperties }
  | { event: "offer_made"; properties: OfferMadeProperties }
  | { event: "offer_accepted"; properties: OfferAcceptedProperties }
  | { event: "watchlist_added"; properties: WatchlistAddedProperties }
  | { event: "watchlist_removed"; properties: WatchlistRemovedProperties }
  | {
      event: "marketplace_zero_results_viewed";
      properties: MarketplaceZeroResultsProperties;
    }
  | {
      event: "marketplace_zero_results_action_clicked";
      properties: MarketplaceZeroResultsActionProperties;
    }
  | {
      event: "saved_search_alert_created";
      properties: SavedSearchAlertCreatedProperties;
    }
  | {
      event: "buyer_request_created";
      properties: BuyerRequestCreatedProperties;
    };

export function track<T extends PlankMarketEvent>(
  distinctId: string,
  event: T["event"],
  properties: T["properties"],
  consentGranted = false,
): void {
  if (typeof window !== "undefined") {
    console.warn(
      "Server-side track function called on client. Use useTrack hook instead."
    );
    return;
  }
  if (!consentGranted) {
    return;
  }

  getPostHogServer()?.capture({
    distinctId,
    event,
    properties: sanitizeAnalyticsProperties(
      properties as unknown as Record<string, unknown>,
    ),
  });
}
