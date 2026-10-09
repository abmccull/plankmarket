"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { trpc } from "@/lib/trpc/client";
import Link from "next/link";
import { AgentSettingsNav } from "@/components/agent/agent-settings-nav";
import { OfferRulesTab } from "@/components/agent/offer-rules-tab";
import { SavedSearchAlertsTab } from "@/components/agent/saved-search-alerts-tab";
import { RepricingRulesTab } from "@/components/agent/repricing-rules-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Handshake, Eye, TrendingDown, LogIn } from "lucide-react";

function AgentSettingsContent() {
  const user = useAuthStore((state) => state.user);
  const sessionLoading = useAuthStore((state) => state.isLoading);
  const isSeller = user?.role === "seller" || user?.role === "admin";
  const [activeTab, setActiveTab] = useState("offers");
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.agent.getConfig.useQuery(undefined, {
      staleTime: 5 * 60 * 1000,
      enabled: isSeller,
    });

  if (!user && sessionLoading)
    return <StatePanelLoading label="Checking your account" rows={3} />;
  if (!user)
    return (
      <StatePanel
        icon={LogIn}
        title="Sign in to manage your alerts"
        description="Your account settings will appear after you sign in."
        primaryAction={{
          label: "Sign in",
          href: "/login?redirect=%2Fsettings%2Fagent",
        }}
      />
    );

  if (isSeller && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isSeller && isError && !data)
    return (
      <QueryErrorState
        title="We couldn't load your automation settings"
        description="We couldn't confirm your saved rules. Check their status before making changes."
        onRetry={() => {
          void refetch();
        }}
        isRetrying={isFetching}
      />
    );

  const config = data?.config ?? null;

  return (
    <div className="space-y-4">
      {isSeller && isError && (
        <QueryErrorState
          title="Saved status is unavailable"
          description="Your draft is preserved below. Retry to check the latest saved rules."
          onRetry={() => {
            void refetch();
          }}
          isRetrying={isFetching}
        />
      )}
      {isSeller && data?.proRequired && (
        <div className="rounded-md border p-4 text-sm leading-6">
          Pro is required to enable offer handling and repricing. You can still
          turn off any saved rules. Saved-search alerts are available on Free.
          <Link
            href="/pro"
            className="ml-1 font-medium underline underline-offset-4"
          >
            View Pro
          </Link>
        </div>
      )}
      <Tabs
        value={isSeller ? activeTab : "alerts"}
        onValueChange={setActiveTab}
      >
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start">
          {isSeller && (
            <TabsTrigger value="offers" className="min-h-11 gap-1.5">
              <Handshake className="h-4 w-4" aria-hidden="true" />
              Offer Rules
            </TabsTrigger>
          )}
          <TabsTrigger value="alerts" className="min-h-11 gap-1.5">
            <Eye className="h-4 w-4" aria-hidden="true" />
            Saved-search alerts
          </TabsTrigger>
          {isSeller && (
            <TabsTrigger value="repricing" className="min-h-11 gap-1.5">
              <TrendingDown className="h-4 w-4" aria-hidden="true" />
              Smart Repricing
            </TabsTrigger>
          )}
        </TabsList>

        {isSeller && (
          <TabsContent
            value="offers"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <OfferRulesTab config={config} canEnable={!data?.proRequired} />
          </TabsContent>
        )}
        <TabsContent
          value="alerts"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <SavedSearchAlertsTab />
        </TabsContent>
        {isSeller && (
          <TabsContent
            value="repricing"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <RepricingRulesTab config={config} canEnable={!data?.proRequired} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function AgentSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Automation &amp; alerts</h1>
        <p className="text-muted-foreground mt-1">
          Manage saved-search alerts and configure seller offer handling and
          inventory repricing.
        </p>
      </div>

      <AgentSettingsNav />

      <AgentSettingsContent />
    </div>
  );
}
