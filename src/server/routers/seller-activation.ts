import { createTRPCRouter, protectedProcedure, strictProtectedProcedure } from "../trpc";
import { sellerActivationDraftSchema, sellerActivationSubmitSchema, sellerActivationReconcileSchema } from "@/lib/validators/seller-activation";
import { getSellerActivation, saveSellerActivationDraft, submitSellerActivation, reconcileSellerActivation } from "../services/seller-activation";

export const sellerActivationRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => getSellerActivation(ctx.db, ctx.user.id)),
  saveDraft: strictProtectedProcedure.input(sellerActivationDraftSchema)
    .mutation(({ ctx, input }) => saveSellerActivationDraft(ctx.db, ctx.user.id, input)),
  submit: strictProtectedProcedure.input(sellerActivationSubmitSchema)
    .mutation(({ ctx, input }) => submitSellerActivation(ctx.db, ctx.user.id, input)),
  reconcile: strictProtectedProcedure.input(sellerActivationReconcileSchema)
    .mutation(({ ctx, input }) => reconcileSellerActivation(ctx.db, ctx.user.id, input.id)),
});
