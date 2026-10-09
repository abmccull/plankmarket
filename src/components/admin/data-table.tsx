"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  serverPagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    isFetching?: boolean;
  };
  renderMobileRow?: (row: TData) => React.ReactNode;
}

export function DataTableColumnHeader({
  column,
  title,
}: {
  column: {
    getCanSort: () => boolean;
    toggleSorting: (desc?: boolean) => void;
    getIsSorted: () => false | "asc" | "desc";
  };
  title: string;
}) {
  if (!column.getCanSort()) {
    return <div>{title}</div>;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => {
        const currentSort = column.getIsSorted();
        if (currentSort === "asc") {
          column.toggleSorting(true);
        } else if (currentSort === "desc") {
          column.toggleSorting(false);
        } else {
          column.toggleSorting(false);
        }
      }}
    >
      <span>{title}</span>
      {column.getIsSorted() === "asc" ? (
        <ChevronUp className="ml-2 h-4 w-4" />
      ) : column.getIsSorted() === "desc" ? (
        <ChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <ChevronsUpDown className="ml-2 h-4 w-4" />
      )}
    </Button>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  serverPagination,
  renderMobileRow,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is not memoization-safe by design
  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    // Server mode renders the returned page as-is; it must not page/sort/filter
    // a second time and imply those operations span the entire dataset.
    manualPagination: !!serverPagination,
    manualFiltering: !!serverPagination,
    enableSorting: !serverPagination,
    getPaginationRowModel: serverPagination
      ? undefined
      : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <div className="space-y-4">
      <div
        className={
          renderMobileRow
            ? "hidden xl:flex items-center justify-end"
            : "flex items-center justify-end"
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {renderMobileRow && (
        <div
          className="divide-y rounded-md border xl:hidden"
          aria-label="Queue records"
        >
          {data.length ? (
            data.map((row, index) => (
              <div key={index} className="min-w-0 p-4">
                {renderMobileRow(row)}
              </div>
            ))
          ) : (
            <p className="p-6 text-center text-muted-foreground">No results.</p>
          )}
        </div>
      )}
      <div
        className={renderMobileRow ? "relative hidden xl:block" : "relative"}
      >
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {/* Scroll hint for mobile */}
        <div className="sm:hidden mt-2 text-center text-xs text-muted-foreground">
          Scroll horizontally to see more →
        </div>
      </div>
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
        <div className="text-sm text-muted-foreground text-center sm:text-left sm:flex-1">
          {serverPagination ? (
            <span aria-live="polite">
              {serverPagination.total === 0
                ? "0 results"
                : data.length === 0
                  ? `0 of ${serverPagination.total} results`
                  : `${(serverPagination.page - 1) * serverPagination.pageSize + 1}–${Math.min(serverPagination.page * serverPagination.pageSize, serverPagination.total)} of ${serverPagination.total} results`}
              {serverPagination.totalPages > 0 &&
                (serverPagination.page > serverPagination.totalPages
                  ? " · This page is no longer available."
                  : ` · Page ${serverPagination.page} of ${serverPagination.totalPages}`)}
            </span>
          ) : (
            <>{table.getFilteredRowModel().rows.length} row(s) total.</>
          )}
        </div>
        <div className="flex gap-2 justify-center sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            className={serverPagination ? "min-h-11" : undefined}
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(
                    Math.min(
                      serverPagination.page - 1,
                      Math.max(serverPagination.totalPages, 1),
                    ),
                  )
                : table.previousPage()
            }
            disabled={
              serverPagination
                ? serverPagination.isFetching || serverPagination.page <= 1
                : !table.getCanPreviousPage()
            }
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={serverPagination ? "min-h-11" : undefined}
            onClick={() =>
              serverPagination
                ? serverPagination.onPageChange(serverPagination.page + 1)
                : table.nextPage()
            }
            disabled={
              serverPagination
                ? serverPagination.isFetching ||
                  serverPagination.page >= serverPagination.totalPages
                : !table.getCanNextPage()
            }
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
