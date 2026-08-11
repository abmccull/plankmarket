const EARTH_RADIUS_MILES = 3_959;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LongitudeRange {
  minLongitude: number;
  maxLongitude: number;
}

export interface GeoBoundingBox {
  minLatitude: number;
  maxLatitude: number;
  longitudeRanges: readonly LongitudeRange[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function normalizeLongitude(longitude: number) {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

export function getBoundingBoxForRadius(
  origin: GeoPoint,
  radiusMiles: number,
): GeoBoundingBox {
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return {
      minLatitude: clamp(origin.latitude, -90, 90),
      maxLatitude: clamp(origin.latitude, -90, 90),
      longitudeRanges: [
        {
          minLongitude: clamp(origin.longitude, -180, 180),
          maxLongitude: clamp(origin.longitude, -180, 180),
        },
      ],
    };
  }

  const angularDistance = radiusMiles / EARTH_RADIUS_MILES;
  if (angularDistance >= Math.PI) {
    return {
      minLatitude: -90,
      maxLatitude: 90,
      longitudeRanges: [{ minLongitude: -180, maxLongitude: 180 }],
    };
  }

  const latitudeDelta = toDegrees(angularDistance);
  const minLatitude = clamp(origin.latitude - latitudeDelta, -90, 90);
  const maxLatitude = clamp(origin.latitude + latitudeDelta, -90, 90);

  if (minLatitude <= -90 || maxLatitude >= 90) {
    return {
      minLatitude,
      maxLatitude,
      longitudeRanges: [{ minLongitude: -180, maxLongitude: 180 }],
    };
  }

  const latitudeRadians = toRadians(clamp(origin.latitude, -90, 90));
  const longitudeDelta = toDegrees(
    Math.asin(Math.min(1, Math.sin(angularDistance) / Math.cos(latitudeRadians))),
  );

  if (!Number.isFinite(longitudeDelta) || longitudeDelta >= 180) {
    return {
      minLatitude,
      maxLatitude,
      longitudeRanges: [{ minLongitude: -180, maxLongitude: 180 }],
    };
  }

  const minLongitude = normalizeLongitude(origin.longitude - longitudeDelta);
  const maxLongitude = normalizeLongitude(origin.longitude + longitudeDelta);

  if (minLongitude <= maxLongitude) {
    return {
      minLatitude,
      maxLatitude,
      longitudeRanges: [{ minLongitude, maxLongitude }],
    };
  }

  return {
    minLatitude,
    maxLatitude,
    longitudeRanges: [
      { minLongitude, maxLongitude: 180 },
      { minLongitude: -180, maxLongitude },
    ],
  };
}
