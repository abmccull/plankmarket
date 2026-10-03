import { gt, gte, sql, type SQL } from "drizzle-orm";
import { listings } from "@/server/db/schema/listings";

/** Preserve the existing real-column stock bound without coercing tiny inputs
 * to zero (or throwing). Every positive real is at least 2^-149. */
export function getMinimumAvailableStockSql(requestedSqFt: number) {
  return requestedSqFt > 0 && requestedSqFt < 2 ** -149
    ? gt(listings.totalSqFt, 0)
    : gte(listings.totalSqFt, requestedSqFt);
}

// PostgreSQL rounds float8 ties to even; JS Math.round rounds positive ties up.
const roundPositive = (value: SQL) => sql`(floor(${value}) + case
  when ${value} - floor(${value}) >= 0.5 then 1 else 0 end)`;
const positive = (value: SQL) => sql`(${value} > 0 and ${value} < 'Infinity'::double precision)`;
const fitsBoxes = (quantity: SQL, box: SQL) => {
  // float8 has no remainder operator. Decimal mod and q-trunc(q/b)*b both
  // disagree with JS % at the 0.01 boundary. Binary long division preserves
  // the exact float values: scaling by two is exact, and each subtraction is
  // between values within a factor of two (Sterbenz's lemma). Inputs originate
  // in real/int columns, so scaling stays within finite float8 range.
  return sql`(case when ${quantity} is null or ${box} is null then null else (
    with recursive carton_scales(size) as (
      select ${box}
      union all select size * 2 from carton_scales where size <= ${quantity} / 2
    ), carton_remainders(area, size) as (
      select ${quantity}, max(size) from carton_scales
      union all
      select case when area >= size then area - size else area end, size / 2
      from carton_remainders where size >= ${box}
    )
    select area <= 0.01 or ${box} - area <= 0.01
    from carton_remainders where size < ${box}
  ) end)`;
};

/**
 * Quantity-only counterpart to getPurchaseQuantityPreview(). Unknown terms,
 * pricing, and full-lot packaging conflicts stay visible for clarification.
 * Apply before pagination/counting, never to a page of already-loaded rows.
 */
export function getNoKnownQuantityConflictSql(requestedSqFt: number) {
  return sql<boolean>`(
    select case
      when not ${positive(sql`q.stock`)} or q.stock is null or q.requested > q.stock then false
      when q.full_lot is null or m.minimum is null then true
      when m.minimum > q.stock then false
      when q.box is not null and not ${positive(sql`q.box`)} then true
      when q.full_lot or q.box is null then true
      -- Preview keeps sub-noise quantities for clarification, including those
      -- where JS division underflows to zero but PostgreSQL would throw.
      when x.quantity <= 1e-8 then true
      when c.complete <= q.stock then true
      else (
        -- Evaluate the exact remainder once, only for stock-edge candidates.
        with adjusted as materialized (select case
          when abs(x.quantity - c.nearest) <= least(0.01, greatest(1e-8, abs(c.nearest) * ${2 ** -23}::double precision))
            then case when ${fitsBoxes(sql`x.quantity`, sql`b.size`)} then x.quantity else c.complete end
          else c.complete end as area
        )
        select case when a.area <= q.stock then true
          else n.normalized >= m.minimum and n.normalized + 1e-8 >= q.requested
            and n.normalized <= q.stock and ${fitsBoxes(sql`n.normalized`, sql`b.size`)} end
        from adjusted a
        cross join lateral (select ${roundPositive(sql`(a.area * 10000)`)} / 10000 as normalized) n
      )
    end
    from (select
      -- Text casts match the real values serialized into the public DTO.
      ${listings.totalSqFt}::text::double precision as stock,
      ${listings.moq}::text::double precision as moq,
      ${listings.moqUnit} as unit,
      ${listings.sqFtPerBox}::text::double precision as box,
      ${listings.boxesPerPallet}::double precision as pallet_boxes,
      ${listings.fullLotOnly} as full_lot,
      ${requestedSqFt}::double precision as requested
    ) q
    cross join lateral (select case
      when q.moq is null or q.moq = 0 then 0::double precision
      when not ${positive(sql`q.moq`)} then null
      when q.unit = 'sqft' then q.moq
      when q.unit = 'pallets' and ${positive(sql`q.box`)} and ${positive(sql`q.pallet_boxes`)}
        then (q.moq * q.box) * q.pallet_boxes
      else null end as minimum
    ) m
    cross join lateral (select case when ${positive(sql`q.box`)} then q.box end as size) b
    cross join lateral (select greatest(q.requested, m.minimum) as quantity) x
    cross join lateral (select ${roundPositive(sql`(x.quantity / b.size)`)} * b.size as nearest,
      ceil(x.quantity / b.size) * b.size as complete) c
  )`;
}
