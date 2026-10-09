import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Database } from "@/server/db";
import { auditEvents, users } from "@/server/db/schema";
import { isPro } from "@/lib/pro";
import { appendAuditEvent } from "./audit-ledger";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "./reconciliation-cases";

export const STRIPE_PRO_PRICES = {
  monthly: "price_1T98IpRFBoUcNSX5RayPGieP",
  annual: "price_1T98IqRFBoUcNSX5nVfBQCBW",
} as const;

const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Audit = typeof auditEvents.$inferSelect;
type Provider = Pick<Stripe, "customers" | "subscriptions" | "checkout">;
const intentSchema = z
  .object({
    version: z.literal(1),
    attemptId: z.uuid(),
    sequence: z.number().int().positive(),
    predecessor: z.uuid().nullable(),
    interval: z.enum(["monthly", "annual"]),
    priceId: z.string().min(1),
    email: z.string().min(1).max(255),
    customerId: z.string().min(1).nullable(),
    previousSubscriptionId: z.string().min(1).nullable(),
    successUrl: z.url(),
    cancelUrl: z.url(),
  })
  .strict();
type Intent = z.infer<typeof intentSchema>;
class CheckoutReviewError extends Error {}
function review(reason: string): never {
  throw new CheckoutReviewError(reason);
}
function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function blocked(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
function canonical(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, val]) => [key, normalize(val)]),
          )
        : item;
  return JSON.stringify(normalize(value));
}
function objectId(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}
function markerKey(intent: Intent, stage: string) {
  return `pro-checkout:${intent.attemptId}:${stage}`;
}
const markerActions = {
  "customer-requested": "subscription.customer_requested",
  "customer-accepted": "subscription.customer_accepted",
  "checkout-requested": "subscription.checkout_requested",
  "checkout-accepted": "subscription.checkout_accepted",
  "checkout-closed": "subscription.checkout_closed",
} as const;
type Stage = keyof typeof markerActions;
function customerRequest(
  intent: Intent,
  userId: string,
): Stripe.CustomerCreateParams {
  return {
    email: intent.email,
    metadata: { userId, proCheckoutAttemptId: intent.attemptId },
  };
}
function checkoutRequest(
  intent: Intent,
  userId: string,
  customerId: string,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: intent.priceId, quantity: 1 }],
    success_url: intent.successUrl,
    cancel_url: intent.cancelUrl,
    client_reference_id: intent.attemptId,
    metadata: { userId, proCheckoutAttemptId: intent.attemptId },
    subscription_data: {
      metadata: { userId, proCheckoutAttemptId: intent.attemptId },
    },
  };
}

async function ledger(tx: Database | Transaction, userId: string) {
  const roots = await tx.query.auditEvents.findMany({
    where: and(
      eq(auditEvents.entityType, "pro_checkout"),
      eq(auditEvents.entityId, userId),
      eq(auditEvents.action, "subscription.checkout_intent"),
    ),
  });
  const intents = roots
    .map((row) => {
      const parsed = intentSchema.safeParse(row.metadata);
      if (!parsed.success || row.actorType !== "user" || row.actorId !== userId)
        review("Invalid checkout intent ownership or shape");
      const value = parsed.data;
      if (
        row.idempotencyKey !==
          `pro-checkout-intent:${userId}:${value.sequence}` ||
        value.priceId !== STRIPE_PRO_PRICES[value.interval]
      )
        review("Invalid checkout intent identity");
      return value;
    })
    .sort((a, b) => a.sequence - b.sequence);
  for (let index = 0; index < intents.length; index++) {
    if (
      intents[index].sequence !== index + 1 ||
      intents[index].predecessor !== (intents[index - 1]?.attemptId ?? null)
    )
      review("Ambiguous checkout intent chain");
  }
  if (new Set(intents.map((row) => row.attemptId)).size !== intents.length)
    review("Duplicate checkout attempt identity");
  const rows = intents.length
    ? await tx.query.auditEvents.findMany({
        where: and(
          eq(auditEvents.entityType, "pro_checkout_attempt"),
          inArray(
            auditEvents.entityId,
            intents.map((row) => row.attemptId),
          ),
        ),
      })
    : [];
  const markers = new Map<string, Audit>();
  for (const row of rows) {
    const intent = intents.find((item) => item.attemptId === row.entityId);
    const stage = (Object.keys(markerActions) as Stage[]).find(
      (key) => markerActions[key] === row.action,
    );
    if (
      !intent ||
      !stage ||
      row.idempotencyKey !== markerKey(intent, stage) ||
      row.metadata.userId !== userId ||
      markers.has(row.idempotencyKey)
    )
      review("Ambiguous checkout stage evidence");
    markers.set(row.idempotencyKey, row);
  }
  for (const intent of intents) {
    const customer = markers.get(markerKey(intent, "customer-accepted"));
    if (
      customer &&
      (typeof customer.metadata.customerId !== "string" ||
        !customer.metadata.customerId ||
        Object.keys(customer.metadata).length !== 2 ||
        (intent.customerId &&
          intent.customerId !== customer.metadata.customerId))
    )
      review("Invalid customer acceptance evidence");
    const customerId =
      intent.customerId ??
      (customer?.metadata.customerId as string | undefined);
    const customerPost = markers.get(markerKey(intent, "customer-requested"));
    if (
      customerPost &&
      canonical(customerPost.metadata) !==
        canonical({ userId, request: customerRequest(intent, userId) })
    )
      review("Customer request snapshot differs from its intent");
    const checkoutPost = markers.get(markerKey(intent, "checkout-requested"));
    if (
      checkoutPost &&
      (!customerId ||
        canonical(checkoutPost.metadata) !==
          canonical({
            userId,
            request: checkoutRequest(intent, userId, customerId),
          }))
    )
      review("Checkout request snapshot differs from its intent");
    const accepted = markers.get(markerKey(intent, "checkout-accepted"));
    if (
      accepted &&
      (!customerId ||
        accepted.metadata.customerId !== customerId ||
        typeof accepted.metadata.sessionId !== "string" ||
        !accepted.metadata.sessionId ||
        ![undefined, true].includes(
          accepted.metadata.legacy as true | undefined,
        ) ||
        Object.keys(accepted.metadata).length !==
          (accepted.metadata.legacy ? 4 : 3))
    )
      review("Invalid checkout acceptance evidence");
    const closed = markers.get(markerKey(intent, "checkout-closed"));
    if (
      closed &&
      (!accepted ||
        closed.metadata.customerId !== customerId ||
        closed.metadata.sessionId !== accepted.metadata.sessionId ||
        !["expired", "complete"].includes(String(closed.metadata.status)) ||
        (closed.metadata.status === "complete" &&
          (typeof closed.metadata.subscriptionId !== "string" ||
            !closed.metadata.subscriptionId)))
    )
      review("Checkout retirement lacks terminal identity evidence");
  }
  const unresolved = intents.filter(
    (intent) => !markers.has(markerKey(intent, "checkout-closed")),
  );
  if (
    unresolved.length > 1 ||
    (unresolved[0] && unresolved[0] !== intents.at(-1))
  )
    review("Multiple unresolved checkout attempts");
  return { intents, markers, unresolved: unresolved[0] ?? null };
}

/** Read-only projection of the same validated checkout ledger used by enrollment. */
export async function readProCheckoutEvidence(executor: Database | Transaction, userId: string) {
  const state = await ledger(executor, userId);
  const latest = state.intents.at(-1), intent = state.unresolved;
  const customer = intent ? state.markers.get(markerKey(intent, "customer-accepted")) : undefined;
  const accepted = intent ? state.markers.get(markerKey(intent, "checkout-accepted")) : undefined;
  return {
    latestSequence: latest?.sequence ?? 0,
    latestAttemptId: latest?.attemptId ?? null,
    unresolved: intent ? {
      attemptId: intent.attemptId, sequence: intent.sequence, predecessor: intent.predecessor,
      priceId: intent.priceId, customerId: intent.customerId ?? (customer?.metadata.customerId as string | undefined) ?? null,
      previousSubscriptionId: intent.previousSubscriptionId,
      checkoutRequested: state.markers.has(markerKey(intent, "checkout-requested")),
      acceptedSessionId: (accepted?.metadata.sessionId as string | undefined) ?? null,
      acceptedLegacy: accepted?.metadata.legacy === true,
    } : null,
  };
}

async function listAll<T extends { id: string }>(
  load: (cursor?: string) => Promise<{ data: T[]; has_more: boolean }>,
): Promise<T[]> {
  const rows: T[] = [],
    seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await load(cursor);
    if (!Array.isArray(result.data) || typeof result.has_more !== "boolean")
      review("Malformed provider inventory");
    for (const row of result.data) {
      if (typeof row.id !== "string" || !row.id || seen.has(row.id))
        review("Ambiguous provider pagination");
      seen.add(row.id);
      rows.push(row);
    }
    if (!result.has_more) return rows;
    if (!result.data.length) review("Incomplete provider pagination");
    cursor = result.data.at(-1)!.id;
  }
  return review("Provider inventory exceeds reconciliation limit");
}

/** Commit-before-request ledger protocol. No SQL transaction spans provider I/O.
 * One unresolved attempt survives tabs, processes, response loss and provider key expiry.
 * Entitlement and billing economics remain owned by the existing webhook/Pro policy. */
export async function createProCheckoutSession(
  database: Database,
  userId: string,
  interval: "monthly" | "annual",
  options: { provider: Provider; appUrl: string },
): Promise<{ url: string }> {
  const provider = options.provider;
  let intent: Intent | undefined;
  let observedSubscriptionId: string | null = null;
  let expectedCustomerId: string | null = null;
  function verifySubscription(
    subscription: Stripe.Subscription,
    customerId: string,
  ) {
    if (
      subscription.object !== "subscription" ||
      typeof subscription.id !== "string" ||
      !subscription.id ||
      objectId(subscription.customer) !== customerId ||
      ![
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "paused",
        "incomplete",
        "incomplete_expired",
        "canceled",
      ].includes(subscription.status)
    )
      review("Subscription identity or status cannot be verified");
  }
  async function retrieveSubscription(id: string, customerId: string) {
    const subscription = await provider.subscriptions.retrieve(id);
    if (subscription.id !== id)
      review("Retrieved subscription does not match the requested resource");
    verifySubscription(subscription, customerId);
    return subscription;
  }
  async function retrieveSession(id: string) {
    const session = await provider.checkout.sessions.retrieve(id);
    if (session.id !== id || session.object !== "checkout.session")
      review("Retrieved checkout does not match the requested resource");
    return session;
  }
  async function locked<T>(
    fn: (
      tx: Transaction,
      user: typeof users.$inferSelect,
      state: Awaited<ReturnType<typeof ledger>>,
    ) => Promise<T>,
  ) {
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`pro-checkout:${userId}`}, 0))`,
      );
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user?.active)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "An active account is required to start a subscription.",
        });
      if (isPro(user))
        blocked(
          "You already have Pro access. Manage your existing subscription in billing settings.",
        );
      if (user.stripeCustomerId) {
        const other = await tx.query.users.findFirst({
          where: and(
            eq(users.stripeCustomerId, user.stripeCustomerId),
            ne(users.id, userId),
          ),
          columns: { id: true },
        });
        if (other) review("Billing customer has conflicting local owners");
      }
      return fn(tx, user, await ledger(tx, userId));
    });
  }
  async function current<T>(
    fn: (
      tx: Transaction,
      user: typeof users.$inferSelect,
      markers: Map<string, Audit>,
    ) => Promise<T>,
  ) {
    const active = intent;
    if (!active) return review("Checkout intent missing");
    return locked(async (tx, user, state) => {
      if (state.unresolved?.attemptId !== active.attemptId)
        conflict(
          "This checkout has changed. Check your subscription settings before continuing.",
        );
      if (user.stripeSubscriptionId !== observedSubscriptionId)
        conflict(
          "Your subscription changed. Check your current billing status before continuing.",
        );
      const accepted = state.markers.get(
        markerKey(active, "customer-accepted"),
      );
      const recordedCustomer = accepted?.metadata.customerId;
      if (
        recordedCustomer !== undefined &&
        typeof recordedCustomer !== "string"
      )
        review("Invalid customer acceptance evidence");
      const owner =
        active.customerId ?? (recordedCustomer as string | undefined) ?? null;
      if (
        user.stripeCustomerId !== owner ||
        (expectedCustomerId && owner !== expectedCustomerId)
      )
        review("Billing customer ownership changed during checkout");
      return fn(tx, user, state.markers);
    });
  }
  async function writeMarker(
    tx: Transaction,
    stage: Stage,
    metadata: Record<string, unknown>,
    markers: Map<string, Audit>,
  ) {
    const active = intent!;
    const key = markerKey(active, stage),
      data = { userId, ...metadata };
    const existing = markers.get(key);
    if (existing) {
      if (canonical(existing.metadata) !== canonical(data))
        review("Conflicting provider result for one checkout attempt");
      return existing;
    }
    await appendAuditEvent(tx, {
      actorType: "system",
      action: markerActions[stage],
      entityType: "pro_checkout_attempt",
      entityId: active.attemptId,
      idempotencyKey: key,
      summary: `Pro subscription checkout ${stage}.`,
      metadata: data,
    });
    const saved = await tx.query.auditEvents.findFirst({
      where: eq(auditEvents.idempotencyKey, key),
    });
    if (!saved || canonical(saved.metadata) !== canonical(data))
      review("Checkout stage could not be persisted exactly");
    return saved;
  }
  async function requested(
    stage: "customer" | "checkout",
    request: Record<string, unknown>,
  ) {
    return current(async (tx, _user, markers) =>
      writeMarker(tx, `${stage}-requested`, { request }, markers),
    );
  }
  function retryAllowed(marker: Audit) {
    if (
      marker.createdAt.getTime() > Date.now() ||
      Date.now() - marker.createdAt.getTime() >= RETRY_WINDOW_MS
    )
      review("Provider request is outside its safe idempotent retry window");
  }
  async function beforePost(marker: Audit) {
    await current(async (_tx, _user, markers) => {
      const saved = markers.get(marker.idempotencyKey!);
      if (!saved || canonical(saved.metadata) !== canonical(marker.metadata))
        review("Provider request evidence changed");
      retryAllowed(saved);
    });
    // Recheck after a caller delayed while acquiring the database lock.
    retryAllowed(marker);
  }
  async function acceptCustomer(customer: Stripe.Customer) {
    if (
      customer.object !== "customer" ||
      typeof customer.id !== "string" ||
      !customer.id ||
      customer.metadata.userId !== userId
    )
      review("Provider customer ownership does not match");
    await current(async (tx, user, markers) => {
      const other = await tx.query.users.findFirst({
        where: and(
          eq(users.stripeCustomerId, customer.id),
          ne(users.id, userId),
        ),
        columns: { id: true },
      });
      if (
        other ||
        (user.stripeCustomerId && user.stripeCustomerId !== customer.id)
      )
        review("Provider customer has conflicting ownership");
      await writeMarker(
        tx,
        "customer-accepted",
        { customerId: customer.id },
        markers,
      );
      if (!user.stripeCustomerId)
        await tx
          .update(users)
          .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
          .where(eq(users.id, userId));
    });
    expectedCustomerId = customer.id;
  }
  async function resolveCustomer(): Promise<string> {
    const active = intent!;
    const state = await current(async (_tx, user, markers) => ({
      customerId: user.stripeCustomerId,
      requested: markers.get(markerKey(active, "customer-requested")),
    }));
    if (state.customerId) {
      const customer = await provider.customers.retrieve(state.customerId);
      if (
        customer.id !== state.customerId ||
        customer.object !== "customer" ||
        customer.deleted ||
        customer.metadata.userId !== userId
      )
        review("Existing billing customer cannot be verified");
      expectedCustomerId = state.customerId;
      return state.customerId;
    }
    const customers = await listAll((cursor) =>
      provider.customers.list({
        email: active.email,
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    );
    if (
      customers.some(
        (customer) =>
          customer.object !== "customer" || customer.email !== active.email,
      )
    )
      review("Customer lookup response does not match its requested scope");
    const owned = customers.filter((row) => row.metadata.userId === userId);
    if (owned.length > 1)
      review("Multiple possible billing customers require reconciliation");
    if (owned[0]) {
      const customer = owned[0];
      if (
        customer.metadata.proCheckoutAttemptId !== active.attemptId &&
        (state.requested || customer.metadata.proCheckoutAttemptId)
      )
        review("Unknown customer creation has conflicting evidence");
      await acceptCustomer(customer);
      return customer.id;
    }
    const request = customerRequest(active, userId);
    const marker = await requested(
      "customer",
      request as Record<string, unknown>,
    );
    await beforePost(marker);
    const createdCustomer = await provider.customers.create(
      marker.metadata.request as Stripe.CustomerCreateParams,
      { idempotencyKey: markerKey(active, "customer") },
    );
    if (typeof createdCustomer.id !== "string" || !createdCustomer.id)
      review("Customer creation returned no usable resource identity");
    // Idempotency replay returns the original response; verify the current resource.
    const customer = await provider.customers.retrieve(createdCustomer.id);
    if (
      customer.id !== createdCustomer.id ||
      customer.object !== "customer" ||
      customer.deleted ||
      customer.metadata.proCheckoutAttemptId !== active.attemptId
    )
      review("Created customer is not currently bound to this attempt");
    await acceptCustomer(customer);
    return customer.id;
  }
  async function validateSession(
    session: Stripe.Checkout.Session,
    customerId: string,
    legacy: boolean,
  ) {
    const active = intent!;
    if (
      !session.id ||
      session.object !== "checkout.session" ||
      session.mode !== "subscription" ||
      objectId(session.customer) !== customerId ||
      !["open", "complete", "expired"].includes(session.status ?? "")
    )
      review("Checkout session identity cannot be verified");
    if (legacy) {
      if (
        (session.metadata?.userId && session.metadata.userId !== userId) ||
        session.metadata?.proCheckoutAttemptId
      )
        review("Legacy checkout has conflicting ownership");
    } else if (
      session.metadata?.userId !== userId ||
      session.metadata.proCheckoutAttemptId !== active.attemptId ||
      session.client_reference_id !== active.attemptId
    )
      review("Checkout session is not bound to this attempt");
    const lines = await provider.checkout.sessions.listLineItems(session.id, {
      limit: 100,
    });
    if (
      lines.has_more ||
      lines.data.length !== 1 ||
      lines.data[0].quantity !== 1 ||
      lines.data[0].price?.id !== active.priceId
    )
      review("Checkout line items do not match the selected Pro plan");
  }
  async function acceptSession(
    session: Stripe.Checkout.Session,
    customerId: string,
    legacy: boolean,
  ) {
    await validateSession(session, customerId, legacy);
    await current(async (tx, _user, markers) =>
      writeMarker(
        tx,
        "checkout-accepted",
        {
          customerId,
          sessionId: session.id,
          ...(legacy ? { legacy: true } : {}),
        },
        markers,
      ),
    );
  }
  async function closeSession(
    session: Stripe.Checkout.Session,
    customerId: string,
    subscriptionId?: string,
  ): Promise<never> {
    await current(async (tx, _user, markers) =>
      writeMarker(
        tx,
        "checkout-closed",
        {
          customerId,
          sessionId: session.id,
          status: session.status,
          ...(subscriptionId ? { subscriptionId } : {}),
        },
        markers,
      ),
    );
    conflict(
      "Your previous checkout has ended. Start checkout again if you still want to subscribe.",
    );
  }
  async function requireOpenSession(
    session: Stripe.Checkout.Session,
    customerId: string,
  ): Promise<void> {
    if (session.status === "expired")
      return await closeSession(session, customerId);
    if (session.status === "complete") {
      const subscriptionId = objectId(session.subscription);
      if (subscriptionId) {
        const subscription = await retrieveSubscription(
          subscriptionId,
          customerId,
        );
        if (objectId(subscription.customer) !== customerId)
          review("Completed checkout subscription ownership differs");
        if (["canceled", "incomplete_expired"].includes(subscription.status))
          return await closeSession(session, customerId, subscriptionId);
      }
      blocked(
        "Your checkout was completed and its subscription is being confirmed. Check billing settings before starting another purchase.",
      );
    }
  }
  try {
    intent = await locked(async (tx, user, state) => {
      observedSubscriptionId = user.stripeSubscriptionId;
      if (state.unresolved) {
        if (state.unresolved.interval !== interval)
          conflict(
            `A ${state.unresolved.interval} checkout is already in progress. Resume it before selecting a different billing interval.`,
          );
        return state.unresolved;
      }
      const previous = state.intents.at(-1);
      const value: Intent = {
        version: 1,
        attemptId: randomUUID(),
        sequence: (previous?.sequence ?? 0) + 1,
        predecessor: previous?.attemptId ?? null,
        interval,
        priceId: STRIPE_PRO_PRICES[interval],
        email: user.email,
        customerId: user.stripeCustomerId,
        previousSubscriptionId: user.stripeSubscriptionId,
        successUrl: `${options.appUrl.replace(/\/$/, "")}/pro/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${options.appUrl.replace(/\/$/, "")}/pro`,
      };
      intentSchema.parse(value);
      await appendAuditEvent(tx, {
        actorType: "user",
        actorId: userId,
        action: "subscription.checkout_intent",
        entityType: "pro_checkout",
        entityId: userId,
        idempotencyKey: `pro-checkout-intent:${userId}:${value.sequence}`,
        summary: "User started one durable Pro subscription checkout attempt.",
        metadata: value,
      });
      return value;
    });
    const customerId = await resolveCustomer();
    const accepted = await current(async (_tx, _user, markers) =>
      markers.get(markerKey(intent!, "checkout-accepted")),
    );
    let session: Stripe.Checkout.Session | undefined;
    let legacy = false;
    if (accepted) {
      if (
        typeof accepted.metadata.sessionId !== "string" ||
        accepted.metadata.customerId !== customerId
      )
        review("Invalid checkout acceptance evidence");
      legacy = accepted.metadata.legacy === true;
      session = await retrieveSession(accepted.metadata.sessionId);
    }
    const subscriptions = await listAll((cursor) =>
      provider.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    );
    for (const subscription of subscriptions)
      verifySubscription(subscription, customerId);
    const sessions = await listAll((cursor) =>
      provider.checkout.sessions.list({
        customer: customerId,
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    );
    if (
      sessions.some(
        (row) =>
          row.object !== "checkout.session" ||
          objectId(row.customer) !== customerId ||
          !["subscription", "payment", "setup"].includes(row.mode) ||
          !["open", "complete", "expired"].includes(row.status ?? ""),
      )
    )
      review("Checkout inventory identity or status cannot be verified");
    const matches = sessions.filter(
      (row) => row.metadata?.proCheckoutAttemptId === intent!.attemptId,
    );
    if (
      matches.length > 1 ||
      (session && matches.some((row) => row.id !== session!.id))
    )
      review("Multiple sessions are bound to one checkout attempt");
    if (!session && matches[0]) session = await retrieveSession(matches[0].id);
    if (session) {
      await acceptSession(session, customerId, legacy);
      await requireOpenSession(session, customerId);
    }
    if (
      subscriptions.some(
        (row) => !["canceled", "incomplete_expired"].includes(row.status),
      )
    )
      blocked(
        "A subscription already exists for your billing account. Manage it in subscription settings instead of starting another purchase.",
      );
    const open = sessions.filter(
      (row) => row.mode === "subscription" && row.status === "open",
    );
    if (
      open.length > 1 ||
      (session && open.some((row) => row.id !== session!.id))
    )
      review(
        "Multiple outstanding subscription checkouts require reconciliation",
      );
    // A completed checkout can still be processing; an empty subscription list is not absence proof.
    for (const completed of sessions.filter(
      (row) => row.mode === "subscription" && row.status === "complete",
    )) {
      const id = objectId(completed.subscription);
      if (!id)
        review("Completed checkout has an unresolved subscription outcome");
      if (!subscriptions.some((row) => row.id === id)) {
        const subscription = await retrieveSubscription(id, customerId);
        if (
          objectId(subscription.customer) !== customerId ||
          !["canceled", "incomplete_expired"].includes(subscription.status)
        )
          review("Previous checkout subscription is unresolved");
      }
    }
    if (!session && open[0]) {
      session = await retrieveSession(open[0].id);
      legacy = !session.metadata?.proCheckoutAttemptId;
      await acceptSession(session, customerId, legacy);
      await requireOpenSession(session, customerId);
    }
    if (!session) {
      const active = intent;
      const request = checkoutRequest(active, userId, customerId);
      const marker = await requested(
        "checkout",
        request as Record<string, unknown>,
      );
      await beforePost(marker);
      const createdSession = await provider.checkout.sessions.create(
        marker.metadata.request as Stripe.Checkout.SessionCreateParams,
        { idempotencyKey: markerKey(active, "checkout") },
      );
      if (typeof createdSession.id !== "string" || !createdSession.id)
        review("Checkout creation returned no usable resource identity");
      session = await retrieveSession(createdSession.id);
      await acceptSession(session, customerId, false);
      await requireOpenSession(session, customerId);
    }
    if (!session.url) review("Open checkout URL is unavailable");
    const url = new URL(session.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "checkout.stripe.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/(?:c\/)?pay\//.test(url.pathname)
    )
      review("Checkout URL cannot be verified");
    await resolveReconciliationCaseByKey(database, {
      caseKey: `pro-checkout:${intent.attemptId}`,
      resolution: "Existing checkout reconciled against its provider identity.",
    });
    const destination = session.url;
    return await current(async () => ({ url: destination }));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    // Durable intent remains unresolved even if opening the operational case itself fails.
    await openReconciliationCase(database, {
      caseKey: `pro-checkout:${intent?.attemptId ?? userId}`,
      type: "provider_failure",
      source: "stripe",
      severity: "high",
      title: "Pro checkout needs reconciliation",
      summary:
        "A subscription checkout could not be safely confirmed. Reconcile the existing attempt before creating another.",
      externalReference: intent?.attemptId ?? null,
      details: {
        userId,
        attemptId: intent?.attemptId ?? null,
        reason:
          error instanceof CheckoutReviewError
            ? error.message
            : "Provider or durable persistence outcome unavailable",
      },
    });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Your subscription checkout could not be confirmed. Check your billing status before trying again. Retries check the existing attempt before starting another.",
    });
  }
}
