"use client";

import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, TrendingUp, Receipt, Wallet, CreditCard, ShoppingCart } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive" | "secondary" | "info" | "outline"> = {
  pending: "warning",
  confirmed: "info",
  processing: "info",
  shipped: "secondary",
  delivered: "success",
  cancelled: "destructive",
  refunded: "destructive",
};

export default function AdminFinancePage() {
  const { data, isLoading } = trpc.admin.getFinanceStats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold">Unable to load finance data</h1>
      </div>
    );
  }

  const { summary, byStatus, monthlyTrend, escrowBreakdown, topSellers, recentOrders } = data;

  const chartData = monthlyTrend.map((m) => ({
    month: m.month,
    label: new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    gmv: Number(m.gmv),
    fees: Number(m.buyerFees) + Number(m.sellerFees),
    orders: m.orderCount,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Finance</h1>
        <p className="text-muted-foreground mt-1">
          Platform financial performance and analytics
        </p>
      </div>

      {/* Row 1 — KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Total GMV"
          value={formatCurrency(Number(summary.totalGmv))}
          icon={DollarSign}
        />
        <KpiCard
          title="Platform Revenue"
          value={formatCurrency(Number(summary.platformRevenue))}
          icon={TrendingUp}
        />
        <KpiCard
          title="Avg Order Value"
          value={formatCurrency(Number(summary.avgOrderValue))}
          icon={ShoppingCart}
        />
        <KpiCard
          title="Buyer Fees"
          value={formatCurrency(Number(summary.totalBuyerFees))}
          icon={Receipt}
        />
        <KpiCard
          title="Seller Fees"
          value={formatCurrency(Number(summary.totalSellerFees))}
          icon={CreditCard}
        />
        <KpiCard
          title="Total Payouts"
          value={formatCurrency(Number(summary.totalPayouts))}
          icon={Wallet}
        />
      </div>

      {/* Row 2 — Revenue Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis
                  className="text-xs"
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    name === "gmv" ? "GMV" : "Platform Fees",
                  ]}
                  labelFormatter={(label) => String(label)}
                />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  name="gmv"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="fees"
                  name="fees"
                  stroke="hsl(var(--secondary))"
                  fill="hsl(var(--secondary))"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Row 3 — Order Volume */}
      <Card>
        <CardHeader>
          <CardTitle>Order Volume</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis className="text-xs" allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [Number(value), "Orders"]}
                  labelFormatter={(label) => String(label)}
                />
                <Bar
                  dataKey="orders"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Row 4 — Status & Escrow */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byStatus.map((s) => (
                <div key={s.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant[s.status] ?? "outline"}>
                      {s.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {s.count} orders
                    </span>
                  </div>
                  <span className="font-medium">
                    {formatCurrency(Number(s.gmv))}
                  </span>
                </div>
              ))}
              {byStatus.length === 0 && (
                <p className="text-muted-foreground text-sm">No orders yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escrow Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {escrowBreakdown.map((e) => (
                <div key={e.escrowStatus} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {e.escrowStatus}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {e.count} orders
                    </span>
                  </div>
                  <span className="font-medium">
                    {formatCurrency(Number(e.total))}
                  </span>
                </div>
              ))}
              {escrowBreakdown.length === 0 && (
                <p className="text-muted-foreground text-sm">No orders yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Top Sellers & Recent Transactions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Sellers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topSellers.map((seller, i) => (
                <div key={seller.sellerId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-none">
                        {seller.businessName || seller.sellerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {seller.orderCount} orders
                      </p>
                    </div>
                  </div>
                  <span className="font-medium">
                    {formatCurrency(Number(seller.gmv))}
                  </span>
                </div>
              ))}
              {topSellers.length === 0 && (
                <p className="text-muted-foreground text-sm">No sellers yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant[order.status] ?? "outline"}>
                      {order.status}
                    </Badge>
                    <span className="font-medium">
                      {formatCurrency(Number(order.totalPrice))}
                    </span>
                  </div>
                </div>
              ))}
              {recentOrders.length === 0 && (
                <p className="text-muted-foreground text-sm">No orders yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
