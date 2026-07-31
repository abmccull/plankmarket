import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { resend } from "@/lib/email/client";
import { processVerifiedResendWebhook } from "@/lib/email/webhook";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const webhookSecret = env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Email webhook is not configured" },
      { status: 500 },
    );
  }

  const webhookId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!webhookId || !timestamp || !signature) {
    return NextResponse.json(
      { error: "Missing Resend webhook signature headers" },
      { status: 400 },
    );
  }

  const payload = await request.text();
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: webhookId,
        timestamp,
        signature,
      },
      webhookSecret,
    });
  } catch {
    console.error("Resend webhook signature verification failed", {
      webhookId,
    });
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  try {
    const result = await processVerifiedResendWebhook({
      webhookId,
      event,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("Resend webhook processing failed", {
      webhookId,
      eventType: event.type,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`.slice(0, 1_000)
          : "UnknownError",
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500, headers: { "Retry-After": "5" } },
    );
  }
}
