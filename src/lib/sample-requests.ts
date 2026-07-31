type MaybeDate = Date | string | null | undefined;

export type SampleRequestStatus =
  | "requested"
  | "approved"
  | "declined"
  | "cancelled"
  | "shipped"
  | "delivered";

export type SampleRequestRole = "buyer" | "seller" | "admin";

export type SampleRequestAction =
  | "approve"
  | "decline"
  | "cancel"
  | "ship"
  | "deliver";

export interface SampleRequestState {
  status: SampleRequestStatus;
  buyerConsentedToShareAddressAt?: MaybeDate;
}

export interface SampleRequestAuditEntry {
  action: SampleRequestAction;
  actorRole: SampleRequestRole;
  fromStatus: SampleRequestStatus;
  toStatus: SampleRequestStatus;
  reason: string;
  occurredAt: Date | null;
  idempotent: boolean;
}

export interface SampleRequestTransitionResult {
  kind: "transition" | "noop";
  status: SampleRequestStatus;
  audit: SampleRequestAuditEntry;
}

export class SampleRequestTransitionError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "INVALID_ACTION"
      | "INVALID_STATUS"
      | "REASON_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "SampleRequestTransitionError";
  }
}

export const SAMPLE_REQUEST_STATUS_TRANSITIONS: Record<
  SampleRequestStatus,
  readonly SampleRequestStatus[]
> = {
  requested: ["approved", "declined", "cancelled"],
  approved: ["shipped", "cancelled"],
  shipped: ["delivered"],
  declined: [],
  cancelled: [],
  delivered: [],
};

const STATUS_ACTIONS_BY_ROLE: Record<
  SampleRequestStatus,
  Partial<Record<SampleRequestRole, readonly SampleRequestAction[]>>
> = {
  requested: {
    buyer: ["cancel"],
    seller: ["approve", "decline"],
    admin: ["approve", "decline", "cancel"],
  },
  approved: {
    seller: ["ship", "cancel"],
    admin: ["ship", "cancel"],
  },
  shipped: {
    buyer: ["deliver"],
    admin: ["deliver"],
  },
  declined: {},
  cancelled: {},
  delivered: {},
};

const TERMINAL_IDEMPOTENT_ACTIONS: Partial<
  Record<SampleRequestStatus, readonly [SampleRequestAction, ...SampleRequestRole[]]>
> = {
  declined: ["decline", "seller", "admin"],
  cancelled: ["cancel", "buyer", "seller", "admin"],
  delivered: ["deliver", "buyer", "admin"],
};

export const SAMPLE_REQUEST_TERMINAL_STATUSES: readonly SampleRequestStatus[] = [
  "declined",
  "cancelled",
  "delivered",
];

export function isSampleRequestTerminalStatus(
  status: SampleRequestStatus,
): boolean {
  return SAMPLE_REQUEST_TERMINAL_STATUSES.includes(status);
}

export function getAllowedSampleRequestActions(input: {
  status: SampleRequestStatus;
  actorRole: SampleRequestRole;
}): SampleRequestAction[] {
  return [...(STATUS_ACTIONS_BY_ROLE[input.status][input.actorRole] ?? [])];
}

export function isValidSampleRequestTransition(
  from: SampleRequestStatus,
  to: SampleRequestStatus,
): boolean {
  return SAMPLE_REQUEST_STATUS_TRANSITIONS[from].includes(to);
}

export function getNextSampleRequestStatus(
  action: SampleRequestAction,
): SampleRequestStatus {
  switch (action) {
    case "approve":
      return "approved";
    case "decline":
      return "declined";
    case "cancel":
      return "cancelled";
    case "ship":
      return "shipped";
    case "deliver":
      return "delivered";
  }
}

function toDate(value: MaybeDate): Date | null {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function normalizeReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) {
    throw new SampleRequestTransitionError(
      "REASON_REQUIRED",
      "Sample request transitions require an audit reason.",
    );
  }
  return normalized;
}

function isIdempotentTerminalAction(input: {
  status: SampleRequestStatus;
  action: SampleRequestAction;
  actorRole: SampleRequestRole;
}): boolean {
  const config = TERMINAL_IDEMPOTENT_ACTIONS[input.status];
  if (!config) return false;

  const [expectedAction, ...roles] = config;
  return expectedAction === input.action && roles.includes(input.actorRole);
}

export function canActorAccessSampleAddress(input: {
  actorRole: SampleRequestRole;
  status: SampleRequestStatus;
  buyerConsentedToShareAddressAt?: MaybeDate;
}): boolean {
  if (input.actorRole === "buyer") {
    return true;
  }

  const consentedAt = toDate(input.buyerConsentedToShareAddressAt);
  if (!consentedAt) {
    return false;
  }

  return (
    input.status === "approved" ||
    input.status === "shipped" ||
    input.status === "delivered"
  );
}

export function applySampleRequestAction(input: {
  state: SampleRequestState;
  actorRole: SampleRequestRole;
  action: SampleRequestAction;
  reason: string;
  occurredAt?: MaybeDate;
}): SampleRequestTransitionResult {
  const reason = normalizeReason(input.reason);
  const occurredAt = toDate(input.occurredAt);
  const { state, actorRole, action } = input;
  const nextStatus = getNextSampleRequestStatus(action);

  if (
    isSampleRequestTerminalStatus(state.status) &&
    isIdempotentTerminalAction({ status: state.status, action, actorRole })
  ) {
    return {
      kind: "noop",
      status: state.status,
      audit: {
        action,
        actorRole,
        fromStatus: state.status,
        toStatus: state.status,
        reason,
        occurredAt,
        idempotent: true,
      },
    };
  }

  const allowedActions = getAllowedSampleRequestActions({
    status: state.status,
    actorRole,
  });

  if (!allowedActions.includes(action)) {
    if (isSampleRequestTerminalStatus(state.status)) {
      throw new SampleRequestTransitionError(
        "INVALID_STATUS",
        `Sample request is already ${state.status}.`,
      );
    }

    throw new SampleRequestTransitionError(
      "FORBIDDEN",
      `${actorRole} cannot ${action} a sample request from ${state.status}.`,
    );
  }

  if (!isValidSampleRequestTransition(state.status, nextStatus)) {
    throw new SampleRequestTransitionError(
      "INVALID_ACTION",
      `Cannot transition sample request from ${state.status} to ${nextStatus}.`,
    );
  }

  return {
    kind: "transition",
    status: nextStatus,
    audit: {
      action,
      actorRole,
      fromStatus: state.status,
      toStatus: nextStatus,
      reason,
      occurredAt,
      idempotent: false,
    },
  };
}
