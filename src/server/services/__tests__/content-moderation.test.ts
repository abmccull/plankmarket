import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs before vi.mock factories, avoiding the TDZ error
const mockRedis = vi.hoisted(() => ({
  incr: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(-1),
  expire: vi.fn().mockResolvedValue(true),
  get: vi.fn().mockResolvedValue(null),
}));

// Mock db
vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock redis
vi.mock("@/lib/redis/client", () => ({
  redis: mockRedis,
}));

// Mock schema (just needs to be importable)
vi.mock("@/server/db/schema", () => ({
  contentViolations: {},
}));

import { db } from "@/server/db";
import {
  checkViolationStatus,
  getViolationCount,
  logContentViolation,
} from "@/server/services/content-moderation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkViolationStatus", () => {
  it("returns action 'none' and allowed true for 0 violations", async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await checkViolationStatus("user-1");

    expect(result).toEqual({
      allowed: true,
      action: "none",
      violationCount: 0,
    });
  });

  it("returns action 'warning' and allowed true for 1 violation", async () => {
    mockRedis.get.mockResolvedValue("1");

    const result = await checkViolationStatus("user-1");

    expect(result).toEqual({
      allowed: true,
      action: "warning",
      violationCount: 1,
    });
  });

  it("returns action 'warning' and allowed true for 2 violations", async () => {
    mockRedis.get.mockResolvedValue("2");

    const result = await checkViolationStatus("user-1");

    expect(result).toEqual({
      allowed: true,
      action: "warning",
      violationCount: 2,
    });
  });

  it("returns action 'rate_limit' and allowed true for 3 violations", async () => {
    mockRedis.get.mockResolvedValue("3");

    const result = await checkViolationStatus("user-1");

    expect(result).toEqual({
      allowed: true,
      action: "rate_limit",
      violationCount: 3,
    });
  });

  it("returns action 'rate_limit' and allowed true for 4 violations", async () => {
    mockRedis.get.mockResolvedValue("4");

    const result = await checkViolationStatus("user-1");

    expect(result).toEqual({
      allowed: true,
      action: "rate_limit",
      violationCount: 4,
    });
  });

  it("returns action 'suspend' and allowed false for 5 violations", async () => {
    mockRedis.get.mockResolvedValue("5");

    const result = await checkViolationStatus("user-1");

    expect(result).toEqual({
      allowed: false,
      action: "suspend",
      violationCount: 5,
    });
  });

  it("returns action 'suspend' and allowed false for 10 violations", async () => {
    mockRedis.get.mockResolvedValue("10");

    const result = await checkViolationStatus("user-1");

    expect(result).toEqual({
      allowed: false,
      action: "suspend",
      violationCount: 10,
    });
  });
});

describe("getViolationCount", () => {
  it("returns parsed integer from Redis string", async () => {
    mockRedis.get.mockResolvedValue("7");

    const count = await getViolationCount("user-1");

    expect(count).toBe(7);
    expect(mockRedis.get).toHaveBeenCalledWith("violation-count:user-1");
  });

  it("returns 0 when Redis returns null", async () => {
    mockRedis.get.mockResolvedValue(null);

    const count = await getViolationCount("user-1");

    expect(count).toBe(0);
  });
});

describe("logContentViolation", () => {
  it("inserts a violation record and increments the Redis counter", async () => {
    mockRedis.ttl.mockResolvedValue(-1);

    await logContentViolation({
      userId: "user-1",
      contentType: "listing",
      contentBody: "some bad content",
      detections: [{ pattern: "test", category: "spam", severity: "medium" }] as any,
    });

    expect(db.insert).toHaveBeenCalled();
    expect(mockRedis.incr).toHaveBeenCalledWith("violation-count:user-1");
    expect(mockRedis.ttl).toHaveBeenCalledWith("violation-count:user-1");
    expect(mockRedis.expire).toHaveBeenCalledWith(
      "violation-count:user-1",
      30 * 24 * 60 * 60,
    );
  });
});
