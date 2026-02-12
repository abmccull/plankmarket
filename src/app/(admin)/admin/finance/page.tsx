"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import {
  Loader2,
  DollarSign,
  TrendingUp,
  Receipt,
  Wallet,
  CreditCard,
  ShoppingCart,
  Search,
  X,
} from "lucide-react";
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
import type { OrderStatus } from "@/types";

const statusVariant: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "secondary" | "info" | "outline"
> = {
  pending: "warning",
  confirmed: "info",
  processing: "info",
  shipped: "secondary",
  delivered: "success",
  cancelled: "destructive",
  refunded: "destructive",
};

export default function AdminFinancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Finance</h1>
        <p className="text-muted-foreground mt-1">
          Platform financial performance and analytics
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Overview Tab ─── */

function OverviewTab() {
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
        <p className="text-muted-foreground">Unable to load finance data</p>
      </div>
    );
  }

  const { summary, byStatus, monthlyTrend, escrowBreakdown, topSellers, recentOrders } = data;

  const chartData = monthlyTrend.map((m) => ({
    month: m.month,
    label: new Date(m.month + "-01").toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    gmv: Number(m.gmv),
    fees: Number(m.buyerFees) + Number(m.sellerFees),
    orders: m.orderCount,
  }));

  return (
    <div className="space-y-6 mt-4">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <KpiCard title="Total GMV" value={formatCurrency(Number(summary.totalGmv))} icon={DollarSign} />
        <KpiCard title="Platform Revenue" value={formatCurrency(Number(summary.platformRevenue))} icon={TrendingUp} />
        <KpiCard title="Avg Order Value" value={formatCurrency(Number(summary.avgOrderValue))} icon={ShoppingCart} />
        <KpiCard title="Buyer Fees" value={formatCurrency(Number(summary.totalBuyerFees))} icon={Receipt} />
        <KpiCard title="Seller Fees" value={formatCurrency(Number(summary.totalSellerFees))} icon={CreditCard} />
        <KpiCard title="Total Payouts" value={formatCurrency(Number(summary.totalPayouts))} icon={Wallet} />
      </div>

      {/* Revenue Over Time */}
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
                <YAxis className="text-xs" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(Number(value)), name === "gmv" ? "GMV" : "Platform Fees"]}
                  labelFormatter={(label) => String(label)}
                />
                <Area type="monotone" dataKey="gmv" name="gmv" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                <Area type="monotone" dataKey="fees" name="fees" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary))" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Order Volume */}
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
                <Tooltip formatter={(value) => [Number(value), "Orders"]} labelFormatter={(label) => String(label)} />
                <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Status & Escrow */}
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
                    <Badge variant={statusVariant[s.status] ?? "outline"}>{s.status}</Badge>
                    <span className="text-sm text-muted-foreground">{s.count} orders</span>
                  </div>
                  <span className="font-medium">{formatCurrency(Number(s.gmv))}</span>
                </div>
              ))}
              {byStatus.length === 0 && <p className="text-muted-foreground text-sm">No orders yet</p>}
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
                    <Badge variant="outline" className="capitalize">{e.escrowStatus}</Badge>
                    <span className="text-sm text-muted-foreground">{e.count} orders</span>
                  </div>
                  <span className="font-medium">{formatCurrency(Number(e.total))}</span>
                </div>
              ))}
              {escrowBreakdown.length === 0 && <p className="text-muted-foreground text-sm">No orders yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Sellers & Recent Transactions */}
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
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium leading-none">{seller.businessName || seller.sellerName}</p>
                      <p className="text-xs text-muted-foreground">{seller.orderCount} orders</p>
                    </div>
                  </div>
                  <span className="font-medium">{formatCurrency(Number(seller.gmv))}</span>
                </div>
              ))}
              {topSellers.length === 0 && <p className="text-muted-foreground text-sm">No sellers yet</p>}
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
                    <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant[order.status] ?? "outline"}>{order.status}</Badge>
                    <span className="font-medium">{formatCurrency(Number(order.totalPrice))}</span>
                  </div>
                </div>
              ))}
              {recentOrders.length === 0 && <p className="text-muted-foreground text-sm">No orders yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Transactions Tab ─── */

function TransactionsTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [escrowFilter, setEscrowFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const queryInput = {
    search: search || undefined,
    status:
      statusFilter !== "all"
        ? (statusFilter as "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded")
        : undefined,
    escrowStatus: escrowFilter !== "all" ? escrowFilter as "none" | "held" | "released" | "refunded" : undefined,
    page,
    limit: 50,
  };

  const { data, isLoading } = trpc.admin.getFinanceTransactions.useQuery(queryInput);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setEscrowFilter("all");
    setPage(1);
  };

  const hasFilters = search || statusFilter !== "all" || escrowFilter !== "all";

  return (
    <div className="space-y-4 mt-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Order number..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="w-[160px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Order Status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[160px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Escrow Status
              </label>
              <Select
                value={escrowFilter}
                onValueChange={(v) => {
                  setEscrowFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Escrow</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="held">Held</SelectItem>
                  <SelectItem value="released">Released</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.transactions.length > 0 ? (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Listing</TableHead>
                  <TableHead className="text-right">Qty (sqft)</TableHead>
                  <TableHead className="text-right">$/sqft</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Buyer Fee</TableHead>
                  <TableHead className="text-right">Seller Fee</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Seller Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Escrow</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-sm">
                      {tx.orderNumber}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(tx.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.buyer.businessName || tx.buyer.name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.seller.businessName || tx.seller.name}
                    </TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">
                      {tx.listing.title}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {Number(tx.quantitySqFt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(Number(tx.pricePerSqFt))}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(Number(tx.subtotal))}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(Number(tx.buyerFee))}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(Number(tx.sellerFee))}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatCurrency(Number(tx.totalPrice))}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(Number(tx.sellerPayout))}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={tx.status as OrderStatus} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {tx.escrowStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(data.page - 1) * data.limit + 1}–
              {Math.min(data.page * data.limit, data.total)} of {data.total} transactions
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {hasFilters ? "No transactions match your filters" : "No transactions yet"}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── KPI Card ─── */

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
