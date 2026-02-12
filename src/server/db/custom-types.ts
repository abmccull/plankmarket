import { customType } from "drizzle-orm/pg-core";

/**
 * Custom numeric column type that stores exact decimal values in PostgreSQL
 * but returns JavaScript numbers (via parseFloat) for seamless arithmetic.
 * Use this for all monetary/financial fields instead of `real` (float4).
 */
export const money = customType<{ data: number; driverData: string }>({
  dataType() {
    return "numeric(12, 4)";
  },
  fromDriver(value: string) {
    return parseFloat(value);
  },
  toDriver(value: number) {
    return value.toString();
  },
});
