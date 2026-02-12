import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export const getMessagesSchema = z.object({
  conversationId: z.string().uuid(),
  limit: z.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
