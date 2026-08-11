import { describe, expect, it } from "vitest";
import {
  REQUEST_ID_HEADER,
  attachRequestId,
  buildHealthMetadata,
  buildReleaseMetadata,
  createObservabilityHeaders,
  resolveRequestId,
} from "../request-observability";

describe("request observability helpers", () => {
  it("reuses a valid inbound request identifier", () => {
    const requestId = resolveRequestId(
      new Headers({ [REQUEST_ID_HEADER]: "req-valid-12345678" }),
    );

    expect(requestId).toBe("req-valid-12345678");
  });

  it("attaches the resolved request identifier to downstream requests", () => {
    const request = new Request("https://www.plankmarket.com/api/trpc", {
      method: "POST",
    });

    const nextRequest = attachRequestId(request, "req-valid-12345678");

    expect(nextRequest.headers.get(REQUEST_ID_HEADER)).toBe(
      "req-valid-12345678",
    );
  });

  it("adds request and timing headers without dropping existing headers", () => {
    const headers = createObservabilityHeaders({
      requestId: "req-valid-12345678",
      durationMs: 42.4,
      headers: { "Cache-Control": "no-store" },
    });

    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get(REQUEST_ID_HEADER)).toBe("req-valid-12345678");
    expect(headers.get("Server-Timing")).toBe("app;dur=42");
  });

  it("builds non-secret health metadata", () => {
    process.env.PLANKMARKET_BUILD_SHA =
      "0123456789abcdef0123456789abcdef01234567";
    const meta = buildHealthMetadata("req-valid-12345678");

    expect(meta).toMatchObject({
      requestId: "req-valid-12345678",
      release: {
        buildSha: "0123456789abcdef0123456789abcdef01234567",
        commercialPolicyVersion: 1,
        packageVersion: "0.1.0",
        schemaVersion: "0034",
      },
      service: "plankmarket",
    });
    expect(meta.release.fingerprint).toContain(
      "sha:0123456789abcdef0123456789abcdef01234567",
    );
  });

  it("falls back to an unavailable build sha when CI does not inject one", () => {
    delete process.env.PLANKMARKET_BUILD_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;

    expect(buildReleaseMetadata()).toMatchObject({
      buildSha: null,
      commercialPolicyVersion: 1,
      packageVersion: "0.1.0",
      schemaVersion: "0034",
    });
  });
});
