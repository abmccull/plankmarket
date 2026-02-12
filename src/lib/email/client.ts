import { Resend } from "resend";
import { env } from "@/env";

export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
