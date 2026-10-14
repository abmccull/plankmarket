import { Resend } from "resend";
import { env } from "@/env";

// Missing keys stay import-safe (pre-launch / local). sendEmailOrThrow no-ops
// when unset; the sentinel only matters if a caller hits the Resend SDK directly.
export const resend = new Resend(env.RESEND_API_KEY ?? "re_dev_not_configured");
