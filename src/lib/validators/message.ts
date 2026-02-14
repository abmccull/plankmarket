import { z } from "zod";
import { noContactInfo } from "@/lib/content-filter/zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(2000).superRefine(noContactInfo("message")),
});

export const getMessagesSchema = z.object({
  conversationId: z.string().uuid(),
  limit: z.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
