import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, List, Package, DollarSign, ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface StatsOverviewProps {
  totalUsers: number;
  activeListings: number;
  totalOrders: number;
  revenue: number;
  pendingVerifications: number;
}

export function StatsOverview({
  totalUsers,
  activeListings,
  totalOrders,
  revenue,
  pendingVerifications,
}: StatsOverviewProps) {
  const stats = [
    {
      title: "Total Users",
      value: totalUsers.toLocaleString(),
      icon: Users,
      description: "Registered users",
    },
    {
      title: "Active Listings",
      value: activeListings.toLocaleString(),
      icon: List,
      description: "Currently available",
    },
    {
      title: "Total Orders",
      value: totalOrders.toLocaleString(),
      icon: Package,
      description: "All-time orders",
    },
    {
      title: "Revenue",
      value: formatCurrency(revenue),
      icon: DollarSign,
      description: "Platform fees collected",
    },
    {
      title: "Pending Verifications",
      value: pendingVerifications.toLocaleString(),
      icon: ShieldCheck,
      description: "Awaiting review",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
