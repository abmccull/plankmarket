export const PURCHASE_PURPOSES = ["business_use", "resale"] as const;
export type PurchasePurpose = typeof PURCHASE_PURPOSES[number];
export const RESALE_ATTESTATION = "I certify that these purchases are for resale in the regular course of my business. I will not claim this exemption for materials I consume or install where the applicable rules treat me as the consumer. I will notify PlankMarket if my eligibility changes.";
export const TEXAS_RESALE_STATEMENT = "I, the purchaser named above, claim the right to make a non-taxable purchase (for resale of the taxable items described above or on the attached order or invoice) from the seller named above. I understand that I will be liable for payment of all state and local sales or use taxes which become due for failure to comply with the provisions of the Tax Code and/or all applicable law. I understand that it is a criminal offense to give a resale certificate to the seller for taxable items that I know, at the time of purchase, are purchased for use rather than for the purpose of resale, lease or rental, and depending on the amount of tax evaded, the offense may range from a Class C misdemeanor to a felony of the second degree.";

export interface ResaleRule {
  state: string;
  enabled: boolean;
  revision: number;
  policyReference: string;
  recipientName: string;
  recipientAddress: string;
  freightExempt: boolean;
  electronicTexas: boolean;
}
export interface ResaleCertificateData {
  legalName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  permitNumber: string;
  permitState: string;
  businessDescription: string;
  itemsDescription: string;
  signerName: string;
  signerTitle: string;
  attestation: string;
  texasStatement?: string;
  signedAt: string;
  recipientName: string;
  recipientAddress: string;
}
export interface ResaleCertificateRecord {
  id: string;
  buyerId: string;
  state: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  ruleRevision: number;
  buyerIdentityFingerprint: string;
  validFrom: Date | null;
  expiresAt: Date | null;
  reviewedAt: Date | null;
  documentId: string | null;
  data: ResaleCertificateData;
}
export interface ResaleDecision {
  version: 1;
  purpose: PurchasePurpose;
  applied: boolean;
  reason: string;
  state: string;
  evaluatedAt: string;
  certificateId: string | null;
  certificate?: ResaleCertificateData;
  documentId?: string | null;
  reviewedAt?: string;
  validFrom?: string;
  expiresAt?: string | null;
  buyerIdentityFingerprint?: string;
  rule?: ResaleRule;
  exemptInventory: boolean;
  exemptFreight: boolean;
}

export function resolveResaleDecision(input: {
  purpose: PurchasePurpose;
  buyerId: string;
  state: string;
  buyerIdentityFingerprint: string;
  rule?: ResaleRule | null;
  certificates: ResaleCertificateRecord[];
  now?: Date;
}): ResaleDecision {
  const now = input.now ?? new Date();
  const base: ResaleDecision = { version: 1, purpose: input.purpose, applied: false, reason: "business_use", state: input.state, evaluatedAt: now.toISOString(), certificateId: null, exemptInventory: false, exemptFreight: false };
  if (input.purpose !== "resale") return base;
  const rule = input.rule;
  if (!rule?.enabled || rule.state !== input.state || !rule.policyReference.trim() || !rule.recipientName.trim() || !rule.recipientAddress.trim()) return { ...base, reason: "state_not_supported" };
  const matching = input.certificates.filter(c => c.buyerId === input.buyerId && c.state === input.state);
  const certificate = matching.find(c => c.status === "approved" && c.ruleRevision === rule.revision && c.buyerIdentityFingerprint === input.buyerIdentityFingerprint && c.reviewedAt && c.validFrom && c.validFrom <= now && (!c.expiresAt || c.expiresAt > now));
  if (!certificate) return { ...base, reason: matching.some(c => c.status === "pending") ? "review_pending" : "certificate_required" };
  return { ...base, applied: true, reason: "approved_resale_certificate", certificateId: certificate.id, certificate: certificate.data, documentId: certificate.documentId, reviewedAt: certificate.reviewedAt!.toISOString(), validFrom: certificate.validFrom!.toISOString(), expiresAt: certificate.expiresAt?.toISOString() ?? null, buyerIdentityFingerprint: certificate.buyerIdentityFingerprint, rule: { ...rule }, exemptInventory: true, exemptFreight: rule.freightExempt };
}

export function resaleStatusMessage(reason: string) {
  if (reason === "approved_resale_certificate") return "Resale exemption available for this destination.";
  if (reason === "review_pending") return "Your certificate is under review. You can continue with applicable tax.";
  if (reason === "state_not_supported") return "Resale setup is not available for this destination yet. Applicable tax will be calculated.";
  return "Add a valid resale certificate, or continue with applicable tax.";
}
