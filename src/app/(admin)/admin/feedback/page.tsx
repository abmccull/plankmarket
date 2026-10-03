"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  DataTable,
  DataTableColumnHeader,
} from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { formatDate } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface Feedback {
  id: string;
  type: string;
  page: string | null;
  message: string;
  rating: number | null;
  user: { name: string; email: string } | null;
  createdAt: Date | string;
  [key: string]: unknown;
}

function FeedbackMessage({ message }: { message: string }) {
  if (message.length <= 160) {
    return (
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message}</p>
    );
  }
  return (
    <div className="space-y-2 [overflow-wrap:anywhere]">
      <p className="text-sm text-muted-foreground">{message.slice(0, 160)}…</p>
      <details>
        <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-sm font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Read message
        </summary>
        <p className="whitespace-pre-wrap pt-2">{message}</p>
      </details>
    </div>
  );
}

export default function AdminFeedbackPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const feedbackQuery = trpc.feedback.getAll.useQuery(
    { page, limit: 50 },
    { retry: false },
  );
  const feedbackData = feedbackQuery.data;
  const pages = Math.max(1, feedbackData?.totalPages ?? 1);
  const recoveringPage =
    Boolean(feedbackData) && !feedbackQuery.isError && page > pages;
  if (
    feedbackData &&
    !feedbackQuery.isError &&
    !feedbackQuery.isFetching &&
    page > pages
  ) {
    setPage(pages);
  }

  const columns: ColumnDef<Feedback>[] = [
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "page",
      header: "Page",
      cell: ({ row }) => (
        <span className="text-sm font-mono whitespace-normal [overflow-wrap:anywhere]">
          {row.original.page ?? "Not provided"}
        </span>
      ),
    },
    {
      accessorKey: "message",
      header: "Message",
      cell: ({ row }) => (
        <div className="max-w-xl whitespace-normal">
          <FeedbackMessage message={row.original.message} />
        </div>
      ),
    },
    {
      accessorKey: "rating",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Rating" />
      ),
      cell: ({ row }) =>
        row.original.rating ? (
          <span>{row.original.rating} / 5</span>
        ) : (
          <span className="text-muted-foreground">N/A</span>
        ),
    },
    {
      accessorKey: "user",
      header: "User",
      cell: ({ row }) =>
        row.original.user ? (
          <div className="whitespace-normal [overflow-wrap:anywhere]">
            <div className="text-sm">{row.original.user.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.user.email}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">Anonymous</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ];

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Feedback Review</h1>
          <p className="text-muted-foreground mt-1">
            Review user feedback and suggestions, newest first.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-auto min-h-11 max-w-full whitespace-normal"
          onClick={() => void utils.feedback.getAll.invalidate()}
          disabled={feedbackQuery.isFetching}
        >
          Refresh queue
        </Button>
      </div>

      {feedbackQuery.isLoading || recoveringPage ? (
        <StatePanelLoading label="Loading feedback" rows={3} />
      ) : feedbackQuery.isError || !feedbackData ? (
        <QueryErrorState
          title="Feedback unavailable"
          description="Feedback could not be loaded. Try again; your selected page is kept."
          onRetry={() => void utils.feedback.getAll.invalidate()}
          isRetrying={feedbackQuery.isFetching}
        />
      ) : (
        <div className="[&_.justify-center]:flex-wrap [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal">
          <DataTable
            columns={columns}
            data={feedbackData.feedback}
            serverPagination={{
              page,
              pageSize: 50,
              total: feedbackData.total,
              totalPages: feedbackData.totalPages,
              onPageChange: setPage,
              isFetching: feedbackQuery.isFetching,
            }}
            renderMobileRow={(row) => (
              <article className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className="capitalize">
                    {row.type}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </span>
                </div>
                <FeedbackMessage message={row.message} />
                <dl className="space-y-1 text-sm">
                  <div>
                    <dt className="inline font-medium">Page: </dt>
                    <dd className="inline font-mono">
                      {row.page ?? "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Rating: </dt>
                    <dd className="inline">
                      {row.rating ? `${row.rating} / 5` : "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">User: </dt>
                    <dd className="inline">
                      {row.user
                        ? `${row.user.name} · ${row.user.email}`
                        : "Anonymous"}
                    </dd>
                  </div>
                </dl>
              </article>
            )}
          />
        </div>
      )}
    </div>
  );
}
