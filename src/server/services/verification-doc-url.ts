import { env } from "@/env";
import {
  parseAllowedHostList,
  validateAllowlistedHttpsUrl,
} from "./allowlisted-https-url";

export function getAllowedVerificationDocHosts(): string[] {
  return parseAllowedHostList(env.VERIFICATION_DOC_ALLOWED_HOSTS);
}

export function validateVerificationDocUrl(rawUrl: string): {
  ok: boolean;
  reason?: string;
  parsedUrl?: URL;
} {
  const result = validateAllowlistedHttpsUrl(rawUrl, {
    allowedHosts: getAllowedVerificationDocHosts(),
    resourceLabel: "Verification document URL",
  });
  return result.ok
    ? { ok: true, parsedUrl: result.parsedUrl }
    : { ok: false, reason: result.reason };
}
