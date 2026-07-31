import type { Database } from "@/server/db";
import {
  auditEvents,
  type NewAuditEvent,
} from "@/server/db/schema/audit-events";

type DbExecutor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

const SENSITIVE_KEY =
  /authorization|cookie|secret|token|password|passcode|api[-_]?key|signature|card|bank|routing|account[-_]?number|tax[-_]?id|ein/i;
const MAX_METADATA_BYTES = 32_768;

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > 6) return "[depth-limited]";
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) =>
      sanitizeValue(item, depth + 1, seen),
    );
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, child]) => [
          key,
          SENSITIVE_KEY.test(key)
            ? "[redacted]"
            : sanitizeValue(child, depth + 1, seen),
        ]),
    );
  }
  return String(value);
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitized = sanitizeValue(
    metadata ?? {},
    0,
    new WeakSet<object>(),
  ) as Record<string, unknown>;
  const serialized = JSON.stringify(sanitized);

  if (Buffer.byteLength(serialized, "utf8") > MAX_METADATA_BYTES) {
    throw new Error("Audit metadata exceeds the 32 KB safety limit.");
  }

  return sanitized;
}

export async function appendAuditEvent(
  executor: DbExecutor,
  event: Omit<NewAuditEvent, "id" | "metadata" | "createdAt"> & {
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await executor.insert(auditEvents).values({
    ...event,
    metadata: sanitizeAuditMetadata(event.metadata),
  });
}
