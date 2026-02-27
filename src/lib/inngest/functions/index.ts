import { savedSearchAlerts } from "./saved-search-alerts";
import { listingExpiryWarning } from "./listing-expiry-warning";
import { abandonedCheckout } from "./abandoned-checkout";
import { escrowAutoRelease } from "./escrow-auto-release";
import { shipmentDispatch } from "./shipment-dispatch";
import { shipmentTracking } from "./shipment-tracking";
import { buyerRequestAlerts } from "./buyer-request-alerts";
import { preferenceMatchAlerts } from "./preference-match-alerts";
import { followupReminders } from "./followup-reminders";
import { onboardingDrip } from "./onboarding-drip";
import { firstListingCongrats, firstPurchaseCongrats } from "./milestone-emails";
import { offerAccepted } from "./offer-accepted";

export const functions = [
  savedSearchAlerts,
  listingExpiryWarning,
  abandonedCheckout,
  escrowAutoRelease,
  shipmentDispatch,
  shipmentTracking,
  buyerRequestAlerts,
  preferenceMatchAlerts,
  followupReminders,
  onboardingDrip,
  firstListingCongrats,
  firstPurchaseCongrats,
  offerAccepted,
];
