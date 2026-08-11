import { and, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { getBoundingBoxForRadius, type GeoPoint } from "@/lib/geo-bounds";
import { listings } from "@/server/db/schema/listings";

const EARTH_RADIUS_MILES = 3_959;

export function getListingDistanceMilesSql(
  latitude: number,
  longitude: number,
) {
  const cosine = sql<number>`least(
    1,
    greatest(
      -1,
      cos(radians(${latitude}))
        * cos(radians(${listings.locationLat}))
        * cos(radians(${listings.locationLng}) - radians(${longitude}))
      + sin(radians(${latitude}))
        * sin(radians(${listings.locationLat}))
    )
  )`;

  return sql<number>`${EARTH_RADIUS_MILES} * acos(${cosine})`;
}

export function getListingBoundingBoxConditions(
  origin: GeoPoint,
  radiusMiles: number,
): SQL[] {
  const bounds = getBoundingBoxForRadius(origin, radiusMiles);
  const conditions: SQL[] = [
    gte(listings.locationLat, bounds.minLatitude),
    lte(listings.locationLat, bounds.maxLatitude),
  ];
  const coversEveryLongitude =
    bounds.longitudeRanges.length === 1 &&
    bounds.longitudeRanges[0]?.minLongitude === -180 &&
    bounds.longitudeRanges[0]?.maxLongitude === 180;

  if (!coversEveryLongitude) {
    const longitudeCondition = or(
      ...bounds.longitudeRanges.map((range) =>
        and(
          gte(listings.locationLng, range.minLongitude),
          lte(listings.locationLng, range.maxLongitude),
        ),
      ),
    );
    if (longitudeCondition) conditions.push(longitudeCondition);
  }

  return conditions;
}
