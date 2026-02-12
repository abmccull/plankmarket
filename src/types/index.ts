// ============================================
// PlankMarket Core Type Definitions
// ============================================

export type UserRole = "buyer" | "seller" | "admin";

export type ListingStatus = "draft" | "active" | "sold" | "expired" | "archived";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type MaterialType =
  | "hardwood"
  | "engineered"
  | "laminate"
  | "vinyl_lvp"
  | "bamboo"
  | "tile"
  | "other";

export type FinishType =
  | "matte"
  | "semi_gloss"
  | "gloss"
  | "wire_brushed"
  | "hand_scraped"
  | "distressed"
  | "smooth"
  | "textured"
  | "oiled"
  | "unfinished"
  | "other";

export type GradeType =
  | "select"
  | "1_common"
  | "2_common"
  | "3_common"
  | "cabin"
  | "character"
  | "rustic"
  | "premium"
  | "standard"
  | "economy"
  | "other";

export type ConditionType =
  | "new_overstock"
  | "discontinued"
  | "slight_damage"
  | "returns"
  | "seconds"
  | "remnants"
  | "closeout"
  | "other";

export type ReasonCode =
  | "overproduction"
  | "color_change"
  | "line_discontinuation"
  | "warehouse_clearance"
  | "customer_return"
  | "slight_defect"
  | "packaging_damage"
  | "end_of_season"
  | "other";

export type Certification =
  | "fsc"
  | "floorscore"
  | "greenguard"
  | "greenguard_gold"
  | "carb2"
  | "leed"
  | "nauf"
  | "none";

export type ColorFamily =
  | "light"
  | "medium"
  | "dark"
  | "gray"
  | "white"
  | "blonde"
  | "brown"
  | "red"
  | "ebony"
  | "natural"
  | "multi";

export type Species =
  | "oak"
  | "maple"
  | "walnut"
  | "hickory"
  | "cherry"
  | "ash"
  | "birch"
  | "pine"
  | "teak"
  | "mahogany"
  | "acacia"
  | "brazilian_cherry"
  | "santos_mahogany"
  | "tigerwood"
  | "bamboo"
  | "cork"
  | "other";

export type NotificationType =
  | "order_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "new_offer"
  | "listing_match"
  | "listing_expiring"
  | "payment_received"
  | "review_received"
  | "system";

export type SortOption =
  | "price_asc"
  | "price_desc"
  | "date_newest"
  | "date_oldest"
  | "lot_value_desc"
  | "lot_value_asc"
  | "popularity"
  | "proximity";

export interface SearchFilters {
  query?: string;
  materialType?: MaterialType[];
  species?: Species[];
  colorFamily?: ColorFamily[];
  finishType?: FinishType[];
  thicknessMin?: number;
  thicknessMax?: number;
  widthMin?: number;
  widthMax?: number;
  priceMin?: number;
  priceMax?: number;
  condition?: ConditionType[];
  state?: string[];
  certifications?: Certification[];
  minLotSize?: number;
  maxLotSize?: number;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}
