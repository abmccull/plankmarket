"use client";

import { trpc } from "@/lib/trpc/client";
import { ProGate } from "@/components/pro-gate";
import { AgentSettingsNav } from "@/components/agent/agent-settings-nav";
import { OfferRulesTab } from "@/components/agent/offer-rules-tab";
import { MonitorRulesTab } from "@/components/agent/monitor-rules-tab";
import { RepricingRulesTab } from "@/components/agent/repricing-rules-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Handshake, Eye, TrendingDown } from "lucide-react";

function AgentSettingsContent() {
  const { data, isLoading } = trpc.agent.getConfig.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const config = data?.config ?? null;

  return (
    <Tabs defaultValue="offers">
      <TabsList className="mb-4">
        <TabsTrigger value="offers" className="gap-1.5">
          <Handshake className="h-4 w-4" aria-hidden="true" />
          Offer Rules
        </TabsTrigger>
        <TabsTrigger value="monitor" className="gap-1.5">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Listing Monitor
        </TabsTrigger>
        <TabsTrigger value="repricing" className="gap-1.5">
          <TrendingDown className="h-4 w-4" aria-hidden="true" />
          Smart Repricing
        </TabsTrigger>
      </TabsList>

      <TabsContent value="offers">
        <OfferRulesTab config={config} />
      </TabsContent>
      <TabsContent value="monitor">
        <MonitorRulesTab config={config} />
      </TabsContent>
      <TabsContent value="repricing">
        <RepricingRulesTab config={config} />
      </TabsContent>
    </Tabs>
  );
}

export default function AgentSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">AI Agent</h1>
        <p className="text-muted-foreground mt-1">
          Configure your AI agent to automatically handle offers, monitor
          listings, and reprice inventory.
        </p>
      </div>

      <AgentSettingsNav />

      <ProGate feature="AI Agent">
        <AgentSettingsContent />
      </ProGate>
    </div>
  );
}
