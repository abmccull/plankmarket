const DAY_MS = 24 * 60 * 60 * 1000;
const MARKDOWN_STEP_COUNT = 4;
const DEFAULT_QUANTITY_TOLERANCE = 0.0001;

type MaybeDate = Date | string | null | undefined;

export function getDirectPurchaseUnitPrice(listing: {
  askPricePerSqFt: number;
  buyNowPrice?: number | null;
}): number {
  return listing.buyNowPrice ?? listing.askPricePerSqFt;
}

export type ListingPricingStatus = "resolved" | "blocked" | "invalid";

export interface ResolveListingUnitPriceInput {
  baseUnitPrice: number;
  availableQuantity: number;
  requestedQuantity?: number | null;
  fullLotOnly?: boolean;
  partialQuantityMarkupPercent?: number | null;
  automaticMarkdownFloorPercent?: number | null;
  automaticMarkdownIntervalDays?: number | null;
  automaticMarkdownStartedAt?: MaybeDate;
  now?: MaybeDate;
  quantityTolerance?: number;
}

export interface ListingPricingSnapshot {
  status: ListingPricingStatus;
  isValid: boolean;
  purchaseAllowed: boolean;
  baseUnitPrice: number | null;
  currentBaseUnitPrice: number | null;
  finalUnitPrice: number | null;
  quantity: {
    availableQuantity: number | null;
    requestedQuantity: number | null;
    isPartialQuantity: boolean;
    tolerance: number;
    reason:
      | "assumed_full_quantity"
      | "full_quantity"
      | "partial_quantity"
      | "within_tolerance"
      | "quantity_exceeds_available"
      | "invalid_available_quantity"
      | "invalid_requested_quantity";
  };
  partialQuantity: {
    enabled: boolean;
    applied: boolean;
    markupPercent: number;
    markupMultiplier: number;
    reason:
      | "not_configured"
      | "not_partial_quantity"
      | "applied"
      | "blocked_full_lot_only"
      | "invalid_markup_percent";
  };
  automaticMarkdown: {
    enabled: boolean;
    applied: boolean;
    step: number;
    stepCount: number;
    percentOfOriginal: number | null;
    discountPercent: number | null;
    floorPercent: number | null;
    intervalDays: number | null;
    startedAt: Date | null;
    evaluatedAt: Date;
    reason:
      | "not_configured"
      | "applied"
      | "invalid_floor_percent"
      | "invalid_interval_days"
      | "invalid_started_at";
  };
  reason:
    | "resolved"
    | "blocked_full_lot_only"
    | "invalid_base_unit_price"
    | "invalid_available_quantity"
    | "invalid_requested_quantity"
    | "quantity_exceeds_available"
    | "invalid_partial_markup_percent"
    | "invalid_markdown_floor_percent"
    | "invalid_markdown_interval_days"
    | "invalid_markdown_started_at";
}

export interface AutomaticMarkdownScheduleEntry {
  step: number;
  percentOfOriginal: number;
  discountPercent: number;
  unitPrice: number;
  startsAt: Date | null;
  endsBefore: Date | null;
}

export interface AutomaticMarkdownSchedulePreview {
  isValid: boolean;
  reason:
    | "valid"
    | "invalid_base_unit_price"
    | "invalid_floor_percent"
    | "invalid_interval_days"
    | "invalid_started_at";
  entries: AutomaticMarkdownScheduleEntry[];
}

export interface ResolveAutomaticMarkdownUpdateInput {
  listingStatus?: string | null;
  currentAskPricePerSqFt?: number | null;
  currentBuyNowPricePerSqFt?: number | null;
  automaticMarkdownEnabled?: boolean | null;
  automaticMarkdownFloorPercent?: number | null;
  automaticMarkdownIntervalDays?: number | null;
  automaticMarkdownStartedAt?: MaybeDate;
  automaticMarkdownCurrentStep?: number | null;
  automaticMarkdownLastAppliedAt?: MaybeDate;
  now?: MaybeDate;
}

export interface AutomaticMarkdownListingUpdateDecision {
  status: "ready" | "noop" | "invalid";
  reason:
    | "ready"
    | "disabled"
    | "listing_not_active"
    | "completed"
    | "step_not_due"
    | "invalid_current_price"
    | "invalid_current_buy_now_price"
    | "invalid_current_step"
    | "invalid_markdown_floor_percent"
    | "invalid_markdown_interval_days"
    | "invalid_markdown_started_at";
  evaluatedAt: Date;
  currentStep: number;
  targetStep: number;
  appliedSteps: number;
  baseUnitPrice: number | null;
  currentAskPricePerSqFt: number | null;
  targetAskPricePerSqFt: number | null;
  currentBuyNowPricePerSqFt: number | null;
  targetBuyNowPricePerSqFt: number | null;
  targetPercentOfOriginal: number | null;
  dueAt: Date | null;
  lastAppliedAt: Date | null;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function toDate(value: MaybeDate): Date | null {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function buildMarkdownPercents(floorPercent: number): number[] {
  const stepSize = (100 - floorPercent) / MARKDOWN_STEP_COUNT;

  return Array.from({ length: MARKDOWN_STEP_COUNT + 1 }, (_, step) =>
    roundCurrency(100 - stepSize * step),
  );
}

function clampMarkdownStep(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }

  return Math.max(0, Math.min(MARKDOWN_STEP_COUNT, Math.trunc(value)));
}

function resolveAutomaticMarkdown(input: {
  baseUnitPrice: number;
  automaticMarkdownFloorPercent?: number | null;
  automaticMarkdownIntervalDays?: number | null;
  automaticMarkdownStartedAt?: MaybeDate;
  now?: MaybeDate;
}) {
  const evaluatedAt = toDate(input.now) ?? new Date();
  const floorPercent = input.automaticMarkdownFloorPercent ?? null;
  const intervalDays = input.automaticMarkdownIntervalDays ?? null;

  if (floorPercent == null || intervalDays == null) {
    return {
      ok: true as const,
      currentBaseUnitPrice: roundCurrency(input.baseUnitPrice),
      state: {
        enabled: false,
        applied: false,
        step: 0,
        stepCount: MARKDOWN_STEP_COUNT,
        percentOfOriginal: null,
        discountPercent: null,
        floorPercent,
        intervalDays,
        startedAt: null,
        evaluatedAt,
        reason: "not_configured" as const,
      },
    };
  }

  if (!isFiniteNumber(floorPercent) || floorPercent < 0 || floorPercent > 100) {
    return { ok: false as const, reason: "invalid_markdown_floor_percent" as const };
  }

  if (!isPositiveNumber(intervalDays)) {
    return { ok: false as const, reason: "invalid_markdown_interval_days" as const };
  }

  const startedAt = toDate(input.automaticMarkdownStartedAt);
  if (!startedAt) {
    return { ok: false as const, reason: "invalid_markdown_started_at" as const };
  }

  const elapsedMs = Math.max(0, evaluatedAt.getTime() - startedAt.getTime());
  const rawStep = Math.floor(elapsedMs / (intervalDays * DAY_MS));
  const step = Math.min(MARKDOWN_STEP_COUNT, rawStep);
  const percents = buildMarkdownPercents(floorPercent);
  const percentOfOriginal = percents[step] ?? 100;
  const currentBaseUnitPrice = roundCurrency(
    input.baseUnitPrice * (percentOfOriginal / 100),
  );

  return {
    ok: true as const,
    currentBaseUnitPrice,
    state: {
      enabled: true,
      applied: step > 0,
      step,
      stepCount: MARKDOWN_STEP_COUNT,
      percentOfOriginal,
      discountPercent: roundCurrency(100 - percentOfOriginal),
      floorPercent,
      intervalDays,
      startedAt,
      evaluatedAt,
      reason: "applied" as const,
    },
  };
}

export function resolveListingUnitPrice(
  input: ResolveListingUnitPriceInput,
): ListingPricingSnapshot {
  const tolerance =
    isFiniteNumber(input.quantityTolerance) && input.quantityTolerance >= 0
      ? input.quantityTolerance
      : DEFAULT_QUANTITY_TOLERANCE;

  if (!isPositiveNumber(input.baseUnitPrice)) {
    return {
      status: "invalid",
      isValid: false,
      purchaseAllowed: false,
      baseUnitPrice: null,
      currentBaseUnitPrice: null,
      finalUnitPrice: null,
      quantity: {
        availableQuantity: null,
        requestedQuantity: null,
        isPartialQuantity: false,
        tolerance,
        reason: "invalid_available_quantity",
      },
      partialQuantity: {
        enabled: false,
        applied: false,
        markupPercent: 0,
        markupMultiplier: 1,
        reason: "not_configured",
      },
      automaticMarkdown: {
        enabled: false,
        applied: false,
        step: 0,
        stepCount: MARKDOWN_STEP_COUNT,
        percentOfOriginal: null,
        discountPercent: null,
        floorPercent: null,
        intervalDays: null,
        startedAt: null,
        evaluatedAt: toDate(input.now) ?? new Date(),
        reason: "not_configured",
      },
      reason: "invalid_base_unit_price",
    };
  }

  if (!isPositiveNumber(input.availableQuantity)) {
    return {
      status: "invalid",
      isValid: false,
      purchaseAllowed: false,
      baseUnitPrice: roundCurrency(input.baseUnitPrice),
      currentBaseUnitPrice: null,
      finalUnitPrice: null,
      quantity: {
        availableQuantity: null,
        requestedQuantity: null,
        isPartialQuantity: false,
        tolerance,
        reason: "invalid_available_quantity",
      },
      partialQuantity: {
        enabled: false,
        applied: false,
        markupPercent: 0,
        markupMultiplier: 1,
        reason: "not_configured",
      },
      automaticMarkdown: {
        enabled: false,
        applied: false,
        step: 0,
        stepCount: MARKDOWN_STEP_COUNT,
        percentOfOriginal: null,
        discountPercent: null,
        floorPercent: null,
        intervalDays: null,
        startedAt: null,
        evaluatedAt: toDate(input.now) ?? new Date(),
        reason: "not_configured",
      },
      reason: "invalid_available_quantity",
    };
  }

  const requestedQuantity = input.requestedQuantity ?? input.availableQuantity;
  if (!isPositiveNumber(requestedQuantity)) {
    return {
      status: "invalid",
      isValid: false,
      purchaseAllowed: false,
      baseUnitPrice: roundCurrency(input.baseUnitPrice),
      currentBaseUnitPrice: null,
      finalUnitPrice: null,
      quantity: {
        availableQuantity: roundCurrency(input.availableQuantity),
        requestedQuantity: null,
        isPartialQuantity: false,
        tolerance,
        reason: "invalid_requested_quantity",
      },
      partialQuantity: {
        enabled: false,
        applied: false,
        markupPercent: 0,
        markupMultiplier: 1,
        reason: "not_configured",
      },
      automaticMarkdown: {
        enabled: false,
        applied: false,
        step: 0,
        stepCount: MARKDOWN_STEP_COUNT,
        percentOfOriginal: null,
        discountPercent: null,
        floorPercent: null,
        intervalDays: null,
        startedAt: null,
        evaluatedAt: toDate(input.now) ?? new Date(),
        reason: "not_configured",
      },
      reason: "invalid_requested_quantity",
    };
  }

  if (requestedQuantity > input.availableQuantity + tolerance) {
    return {
      status: "invalid",
      isValid: false,
      purchaseAllowed: false,
      baseUnitPrice: roundCurrency(input.baseUnitPrice),
      currentBaseUnitPrice: null,
      finalUnitPrice: null,
      quantity: {
        availableQuantity: roundCurrency(input.availableQuantity),
        requestedQuantity: roundCurrency(requestedQuantity),
        isPartialQuantity: false,
        tolerance,
        reason: "quantity_exceeds_available",
      },
      partialQuantity: {
        enabled: false,
        applied: false,
        markupPercent: 0,
        markupMultiplier: 1,
        reason: "not_configured",
      },
      automaticMarkdown: {
        enabled: false,
        applied: false,
        step: 0,
        stepCount: MARKDOWN_STEP_COUNT,
        percentOfOriginal: null,
        discountPercent: null,
        floorPercent: null,
        intervalDays: null,
        startedAt: null,
        evaluatedAt: toDate(input.now) ?? new Date(),
        reason: "not_configured",
      },
      reason: "quantity_exceeds_available",
    };
  }

  const markdown = resolveAutomaticMarkdown(input);
  if (!markdown.ok) {
    return {
      status: "invalid",
      isValid: false,
      purchaseAllowed: false,
      baseUnitPrice: roundCurrency(input.baseUnitPrice),
      currentBaseUnitPrice: null,
      finalUnitPrice: null,
      quantity: {
        availableQuantity: roundCurrency(input.availableQuantity),
        requestedQuantity: roundCurrency(requestedQuantity),
        isPartialQuantity: false,
        tolerance,
        reason:
          input.requestedQuantity == null ? "assumed_full_quantity" : "full_quantity",
      },
      partialQuantity: {
        enabled: input.partialQuantityMarkupPercent != null,
        applied: false,
        markupPercent: input.partialQuantityMarkupPercent ?? 0,
        markupMultiplier:
          input.partialQuantityMarkupPercent != null
            ? 1 + input.partialQuantityMarkupPercent / 100
            : 1,
        reason:
          input.partialQuantityMarkupPercent == null
            ? "not_configured"
            : "not_partial_quantity",
      },
      automaticMarkdown: {
        enabled: true,
        applied: false,
        step: 0,
        stepCount: MARKDOWN_STEP_COUNT,
        percentOfOriginal: null,
        discountPercent: null,
        floorPercent: input.automaticMarkdownFloorPercent ?? null,
        intervalDays: input.automaticMarkdownIntervalDays ?? null,
        startedAt: toDate(input.automaticMarkdownStartedAt),
        evaluatedAt: toDate(input.now) ?? new Date(),
        reason:
          markdown.reason === "invalid_markdown_floor_percent"
            ? "invalid_floor_percent"
            : markdown.reason === "invalid_markdown_interval_days"
              ? "invalid_interval_days"
              : "invalid_started_at",
      },
      reason: markdown.reason,
    };
  }

  const difference = input.availableQuantity - requestedQuantity;
  const isPartialQuantity = difference > tolerance;
  const quantityReason =
    input.requestedQuantity == null
      ? "assumed_full_quantity"
      : isPartialQuantity
        ? "partial_quantity"
        : difference >= 0
          ? difference === 0
            ? "full_quantity"
            : "within_tolerance"
          : "quantity_exceeds_available";

  const partialMarkup = input.partialQuantityMarkupPercent;
  if (
    partialMarkup != null &&
    (!isFiniteNumber(partialMarkup) || partialMarkup < 0)
  ) {
    return {
      status: "invalid",
      isValid: false,
      purchaseAllowed: false,
      baseUnitPrice: roundCurrency(input.baseUnitPrice),
      currentBaseUnitPrice: markdown.currentBaseUnitPrice,
      finalUnitPrice: null,
      quantity: {
        availableQuantity: roundCurrency(input.availableQuantity),
        requestedQuantity: roundCurrency(requestedQuantity),
        isPartialQuantity,
        tolerance,
        reason: quantityReason,
      },
      partialQuantity: {
        enabled: true,
        applied: false,
        markupPercent: partialMarkup,
        markupMultiplier: 1,
        reason: "invalid_markup_percent",
      },
      automaticMarkdown: markdown.state,
      reason: "invalid_partial_markup_percent",
    };
  }

  if (input.fullLotOnly && isPartialQuantity) {
    return {
      status: "blocked",
      isValid: true,
      purchaseAllowed: false,
      baseUnitPrice: roundCurrency(input.baseUnitPrice),
      currentBaseUnitPrice: markdown.currentBaseUnitPrice,
      finalUnitPrice: null,
      quantity: {
        availableQuantity: roundCurrency(input.availableQuantity),
        requestedQuantity: roundCurrency(requestedQuantity),
        isPartialQuantity: true,
        tolerance,
        reason: "partial_quantity",
      },
      partialQuantity: {
        enabled: partialMarkup != null,
        applied: false,
        markupPercent: partialMarkup ?? 0,
        markupMultiplier:
          partialMarkup != null ? 1 + partialMarkup / 100 : 1,
        reason: "blocked_full_lot_only",
      },
      automaticMarkdown: markdown.state,
      reason: "blocked_full_lot_only",
    };
  }

  const markupPercent = partialMarkup ?? 0;
  const markupMultiplier = 1 + markupPercent / 100;
  const partialApplied = isPartialQuantity && partialMarkup != null;
  const finalUnitPrice = partialApplied
    ? roundCurrency(markdown.currentBaseUnitPrice * markupMultiplier)
    : markdown.currentBaseUnitPrice;

  return {
    status: "resolved",
    isValid: true,
    purchaseAllowed: true,
    baseUnitPrice: roundCurrency(input.baseUnitPrice),
    currentBaseUnitPrice: markdown.currentBaseUnitPrice,
    finalUnitPrice,
    quantity: {
      availableQuantity: roundCurrency(input.availableQuantity),
      requestedQuantity: roundCurrency(requestedQuantity),
      isPartialQuantity,
      tolerance,
      reason: quantityReason,
    },
    partialQuantity: {
      enabled: partialMarkup != null,
      applied: partialApplied,
      markupPercent,
      markupMultiplier,
      reason:
        partialMarkup == null
          ? "not_configured"
          : partialApplied
            ? "applied"
            : "not_partial_quantity",
    },
    automaticMarkdown: markdown.state,
    reason: "resolved",
  };
}

export function previewAutomaticMarkdownSchedule(input: {
  baseUnitPrice: number;
  floorPercent: number;
  intervalDays: number;
  startedAt?: MaybeDate;
}): AutomaticMarkdownSchedulePreview {
  if (!isPositiveNumber(input.baseUnitPrice)) {
    return {
      isValid: false,
      reason: "invalid_base_unit_price",
      entries: [],
    };
  }

  if (
    !isFiniteNumber(input.floorPercent) ||
    input.floorPercent < 0 ||
    input.floorPercent > 100
  ) {
    return {
      isValid: false,
      reason: "invalid_floor_percent",
      entries: [],
    };
  }

  if (!isPositiveNumber(input.intervalDays)) {
    return {
      isValid: false,
      reason: "invalid_interval_days",
      entries: [],
    };
  }

  const startedAt =
    input.startedAt === undefined ? null : toDate(input.startedAt);

  if (input.startedAt !== undefined && !startedAt) {
    return {
      isValid: false,
      reason: "invalid_started_at",
      entries: [],
    };
  }

  const percents = buildMarkdownPercents(input.floorPercent);

  return {
    isValid: true,
    reason: "valid",
    entries: percents.map((percentOfOriginal, step) => {
      const startsAtStep =
        startedAt == null
          ? null
          : new Date(startedAt.getTime() + step * input.intervalDays * DAY_MS);
      const endsBefore =
        startedAt == null || step === MARKDOWN_STEP_COUNT
          ? null
          : new Date(
              startedAt.getTime() + (step + 1) * input.intervalDays * DAY_MS,
            );

      return {
        step,
        percentOfOriginal,
        discountPercent: roundCurrency(100 - percentOfOriginal),
        unitPrice: roundCurrency(
          input.baseUnitPrice * (percentOfOriginal / 100),
        ),
        startsAt: startsAtStep,
        endsBefore,
      };
    }),
  };
}

export function resolveAutomaticMarkdownListingUpdate(
  input: ResolveAutomaticMarkdownUpdateInput,
): AutomaticMarkdownListingUpdateDecision {
  const evaluatedAt = toDate(input.now) ?? new Date();
  const currentAskPrice = input.currentAskPricePerSqFt ?? null;
  const currentBuyNowPrice = input.currentBuyNowPricePerSqFt ?? null;

  if (!input.automaticMarkdownEnabled) {
    return {
      status: "noop",
      reason: "disabled",
      evaluatedAt,
      currentStep: 0,
      targetStep: 0,
      appliedSteps: 0,
      baseUnitPrice: currentAskPrice,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: currentAskPrice,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: currentBuyNowPrice,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  if (input.listingStatus !== "active") {
    return {
      status: "noop",
      reason: "listing_not_active",
      evaluatedAt,
      currentStep: 0,
      targetStep: 0,
      appliedSteps: 0,
      baseUnitPrice: currentAskPrice,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: currentAskPrice,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: currentBuyNowPrice,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  if (!isPositiveNumber(currentAskPrice)) {
    return {
      status: "invalid",
      reason: "invalid_current_price",
      evaluatedAt,
      currentStep: 0,
      targetStep: 0,
      appliedSteps: 0,
      baseUnitPrice: null,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  if (
    currentBuyNowPrice != null &&
    (!isPositiveNumber(currentBuyNowPrice) || currentBuyNowPrice < 0)
  ) {
    return {
      status: "invalid",
      reason: "invalid_current_buy_now_price",
      evaluatedAt,
      currentStep: 0,
      targetStep: 0,
      appliedSteps: 0,
      baseUnitPrice: null,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const currentStep = clampMarkdownStep(input.automaticMarkdownCurrentStep);
  if (currentStep == null) {
    return {
      status: "invalid",
      reason: "invalid_current_step",
      evaluatedAt,
      currentStep: 0,
      targetStep: 0,
      appliedSteps: 0,
      baseUnitPrice: null,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const floorPercent = input.automaticMarkdownFloorPercent ?? null;
  if (floorPercent == null || !isFiniteNumber(floorPercent) || floorPercent < 0 || floorPercent > 100) {
    return {
      status: "invalid",
      reason: "invalid_markdown_floor_percent",
      evaluatedAt,
      currentStep,
      targetStep: currentStep,
      appliedSteps: 0,
      baseUnitPrice: null,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const intervalDays = input.automaticMarkdownIntervalDays ?? null;
  if (!isPositiveNumber(intervalDays)) {
    return {
      status: "invalid",
      reason: "invalid_markdown_interval_days",
      evaluatedAt,
      currentStep,
      targetStep: currentStep,
      appliedSteps: 0,
      baseUnitPrice: null,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const startedAt = toDate(input.automaticMarkdownStartedAt);
  if (!startedAt) {
    return {
      status: "invalid",
      reason: "invalid_markdown_started_at",
      evaluatedAt,
      currentStep,
      targetStep: currentStep,
      appliedSteps: 0,
      baseUnitPrice: null,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const schedulePercents = buildMarkdownPercents(floorPercent);
  const currentPercentOfOriginal = schedulePercents[currentStep];
  if (!isPositiveNumber(currentPercentOfOriginal)) {
    return {
      status: "invalid",
      reason: "invalid_current_step",
      evaluatedAt,
      currentStep,
      targetStep: currentStep,
      appliedSteps: 0,
      baseUnitPrice: null,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const inferredBaseUnitPrice = roundCurrency(
    currentAskPrice / (currentPercentOfOriginal / 100),
  );
  const targetState = resolveAutomaticMarkdown({
    baseUnitPrice: inferredBaseUnitPrice,
    automaticMarkdownFloorPercent: floorPercent,
    automaticMarkdownIntervalDays: intervalDays,
    automaticMarkdownStartedAt: startedAt,
    now: evaluatedAt,
  });

  if (!targetState.ok) {
    return {
      status: "invalid",
      reason: targetState.reason,
      evaluatedAt,
      currentStep,
      targetStep: currentStep,
      appliedSteps: 0,
      baseUnitPrice: inferredBaseUnitPrice,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: null,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: null,
      targetPercentOfOriginal: null,
      dueAt: null,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const targetStep = targetState.state.step;
  const dueAt =
    targetStep > 0
      ? new Date(startedAt.getTime() + targetStep * intervalDays * DAY_MS)
      : startedAt;

  if (targetStep >= MARKDOWN_STEP_COUNT && currentStep >= MARKDOWN_STEP_COUNT) {
    return {
      status: "noop",
      reason: "completed",
      evaluatedAt,
      currentStep,
      targetStep,
      appliedSteps: 0,
      baseUnitPrice: inferredBaseUnitPrice,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: currentAskPrice,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: currentBuyNowPrice,
      targetPercentOfOriginal: targetState.state.percentOfOriginal,
      dueAt,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  if (targetStep <= currentStep) {
    return {
      status: "noop",
      reason: "step_not_due",
      evaluatedAt,
      currentStep,
      targetStep,
      appliedSteps: 0,
      baseUnitPrice: inferredBaseUnitPrice,
      currentAskPricePerSqFt: currentAskPrice,
      targetAskPricePerSqFt: currentAskPrice,
      currentBuyNowPricePerSqFt: currentBuyNowPrice,
      targetBuyNowPricePerSqFt: currentBuyNowPrice,
      targetPercentOfOriginal: targetState.state.percentOfOriginal,
      dueAt,
      lastAppliedAt: toDate(input.automaticMarkdownLastAppliedAt),
    };
  }

  const buyNowRatio =
    currentBuyNowPrice != null ? currentBuyNowPrice / currentAskPrice : null;
  const targetBuyNowPrice =
    buyNowRatio == null
      ? null
      : roundCurrency(targetState.currentBaseUnitPrice * buyNowRatio);

  return {
    status: "ready",
    reason: "ready",
    evaluatedAt,
    currentStep,
    targetStep,
    appliedSteps: targetStep - currentStep,
    baseUnitPrice: inferredBaseUnitPrice,
    currentAskPricePerSqFt: currentAskPrice,
    targetAskPricePerSqFt: targetState.currentBaseUnitPrice,
    currentBuyNowPricePerSqFt: currentBuyNowPrice,
    targetBuyNowPricePerSqFt: targetBuyNowPrice,
    targetPercentOfOriginal: targetState.state.percentOfOriginal,
    dueAt,
    lastAppliedAt: evaluatedAt,
  };
}
