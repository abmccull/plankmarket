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
import {
  proWelcome,
  proPaymentFailed,
  proExpired,
} from "./subscription-lifecycle";
import { agentOfferHandler } from "./agent-offer-handler";
import { agentMonitor } from "./agent-monitor";
import { agentRepricer } from "./agent-repricer";

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
  proWelcome,
  proPaymentFailed,
  proExpired,
  agentOfferHandler,
  agentMonitor,
  agentRepricer,
];
