import { Suspense } from "react";
import { SellerActivationForm } from "@/components/seller-activation/seller-activation-form";
import { StatePanelLoading } from "@/components/ui/state-panel";

export default function SellingSettingsPage() {
  return <Suspense fallback={<StatePanelLoading label="Loading selling setup" rows={3} />}><SellerActivationForm /></Suspense>;
}
