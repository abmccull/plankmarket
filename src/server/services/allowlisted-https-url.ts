function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

export function parseAllowedHostList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(normalizeHost)
    .filter(Boolean);
}

export function hostMatches(hostname: string, allowedHost: string): boolean {
  if (allowedHost.startsWith("*.")) {
    const root = allowedHost.slice(2);
    return hostname === root || hostname.endsWith(`.${root}`);
  }
  return hostname === allowedHost;
}

export function validateAllowlistedHttpsUrl(
  rawUrl: string,
  options: {
    allowedHosts: string[];
    resourceLabel: string;
  },
): {
  ok: boolean;
  reason?: string;
  parsedUrl?: URL;
  normalizedUrl?: string;
} {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `Invalid ${options.resourceLabel} format` };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      reason: `${options.resourceLabel} must use HTTPS`,
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      ok: false,
      reason: `${options.resourceLabel} cannot contain credentials`,
    };
  }

  if (parsedUrl.port && parsedUrl.port !== "443") {
    return {
      ok: false,
      reason: `${options.resourceLabel} must use the default HTTPS port`,
    };
  }

  const hostname = normalizeHost(parsedUrl.hostname);
  if (!hostname) {
    return {
      ok: false,
      reason: `${options.resourceLabel} is missing a host`,
    };
  }

  if (options.allowedHosts.length === 0) {
    return {
      ok: false,
      reason: `${options.resourceLabel} host allowlist is not configured on the server`,
    };
  }

  const isAllowed = options.allowedHosts.some((allowedHost) =>
    hostMatches(hostname, allowedHost),
  );
  if (!isAllowed) {
    return {
      ok: false,
      reason: `${options.resourceLabel} host "${hostname}" is not allowed`,
    };
  }

  parsedUrl.hostname = hostname;
  parsedUrl.port = "";
  parsedUrl.hash = "";

  return {
    ok: true,
    parsedUrl,
    normalizedUrl: parsedUrl.toString(),
  };
}
