import { env } from "@/env";

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function parseAllowedHostList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);
}

function hostMatches(hostname: string, allowedHost: string): boolean {
  if (allowedHost.startsWith("*.")) {
    const root = allowedHost.slice(2);
    return hostname === root || hostname.endsWith(`.${root}`);
  }
  return hostname === allowedHost;
}

export function getAllowedVerificationDocHosts(): string[] {
  return parseAllowedHostList(env.VERIFICATION_DOC_ALLOWED_HOSTS);
}

export function validateVerificationDocUrl(rawUrl: string): {
  ok: boolean;
  reason?: string;
  parsedUrl?: URL;
} {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid verification document URL format" };
  }

  if (parsedUrl.protocol !== "https:") {
    return { ok: false, reason: "Verification document URL must use HTTPS" };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      ok: false,
      reason: "Verification document URL cannot contain credentials",
    };
  }

  if (parsedUrl.port && parsedUrl.port !== "443") {
    return {
      ok: false,
      reason: "Verification document URL must use the default HTTPS port",
    };
  }

  const hostname = normalizeHost(parsedUrl.hostname);
  if (!hostname) {
    return { ok: false, reason: "Verification document URL is missing a host" };
  }

  const allowedHosts = getAllowedVerificationDocHosts();
  if (allowedHosts.length === 0) {
    return {
      ok: false,
      reason:
        "Verification document host allowlist is not configured on the server",
    };
  }

  const isAllowed = allowedHosts.some((allowedHost) =>
    hostMatches(hostname, allowedHost),
  );
  if (!isAllowed) {
    return {
      ok: false,
      reason: `Verification document host "${hostname}" is not allowed`,
    };
  }

  return { ok: true, parsedUrl };
}
