import { Resend } from "resend";
import { env } from "@/env";

// Production validation requires a real key. The development sentinel keeps
// modules importable while still making any attempted send fail at the provider.
export const resend = new Resend(env.RESEND_API_KEY ?? "re_dev_not_configured");
