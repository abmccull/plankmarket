import { TRPCError } from "@trpc/server";
import { z } from "zod";

const mutablePlatformSettingSchemas = {
  listingExpiryDays: z.number().int().min(1).max(365),
  maxPhotosPerListing: z.number().int().min(1).max(50),
  platformName: z.string().trim().min(2).max(60),
  supportEmail: z.string().trim().email().max(320),
  escrowReleaseDays: z.number().int().min(1).max(30),
} as const;

export const mutablePlatformSettingKeySchema = z.enum([
  "listingExpiryDays",
  "maxPhotosPerListing",
  "platformName",
  "supportEmail",
  "escrowReleaseDays",
]);

export const platformSettingUpdateInput = z.object({
  key: mutablePlatformSettingKeySchema,
  value: z.unknown(),
});

export type MutablePlatformSettingKey = z.infer<
  typeof mutablePlatformSettingKeySchema
>;

export function parseMutablePlatformSetting(
  key: MutablePlatformSettingKey,
  value: unknown,
): unknown {
  const result = mutablePlatformSettingSchemas[key].safeParse(value);
  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid ${key} setting: ${result.error.issues[0]?.message ?? "invalid value"}`,
    });
  }
  return result.data;
}
