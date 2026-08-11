import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sampleRequests,
  shippingAddresses,
  users,
  verificationDrafts,
} from "@/server/db/schema";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

const { runPrivacyRetentionSweep } = await import(
  "@/server/services/privacy-retention"
);

function createExecutor(params: {
  draftReferences: Array<{ userId: string; verificationDocUrl: string | null }>;
  userReferences: Array<{ id: string; verificationDocUrl: string | null }>;
  draftsToPurge: Array<{ userId: string; verificationDocUrl: string | null }>;
  usersToPurge: Array<{ id: string; verificationDocUrl: string | null }>;
  deletedDrafts?: Array<{ userId: string }>;
  purgedUsers?: Array<{ id: string }>;
  purgedSampleRequests?: Array<{ id: string }>;
  deletedShippingAddresses?: Array<{ id: string }>;
}) {
  const userUpdateValues: Array<Record<string, unknown>> = [];

  const verificationDraftDeleteWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(params.deletedDrafts ?? []),
  });
  const shippingDeleteWhere = vi.fn().mockReturnValue({
    returning: vi
      .fn()
      .mockResolvedValue(params.deletedShippingAddresses ?? []),
  });
  const usersUpdateSet = vi.fn((values: Record<string, unknown>) => {
    userUpdateValues.push(values);
    return {
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(params.purgedUsers ?? []),
      }),
    };
  });
  const sampleRequestsUpdateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValue(params.purgedSampleRequests ?? []),
    }),
  });

  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(params.draftReferences),
      }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(params.userReferences),
      }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(params.draftsToPurge),
      }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(params.usersToPurge),
      }),
    });

  const executor = {
    delete: vi.fn((table) => {
      if (table === verificationDrafts) {
        return { where: verificationDraftDeleteWhere };
      }
      if (table === shippingAddresses) {
        return { where: shippingDeleteWhere };
      }
      throw new Error("Unexpected delete table");
    }),
    select,
    update: vi.fn((table) => {
      if (table === users) {
        return { set: usersUpdateSet };
      }
      if (table === sampleRequests) {
        return { set: sampleRequestsUpdateSet };
      }
      throw new Error("Unexpected update table");
    }),
  } as const;

  return {
    executor,
    userUpdateValues,
  };
}

describe("privacy retention sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("purges shared expired drafts locally without deleting retained provider documents and clears user verification notes on purge", async () => {
    const now = new Date("2026-08-03T15:00:00.000Z");
    const { executor, userUpdateValues } = createExecutor({
      draftReferences: [
        {
          userId: "draft-shared",
          verificationDocUrl: "https://utfs.io/f/shared-doc",
        },
        {
          userId: "draft-blocked",
          verificationDocUrl: "https://storage.example.com/draft-doc-2",
        },
      ],
      userReferences: [
        {
          id: "user-retained",
          verificationDocUrl: "https://utfs.io/f/shared-doc",
        },
        {
          id: "user-purge",
          verificationDocUrl: "https://utfs.io/f/verification-doc-1",
        },
      ],
      draftsToPurge: [
        {
          userId: "draft-shared",
          verificationDocUrl: "https://utfs.io/f/shared-doc",
        },
        {
          userId: "draft-blocked",
          verificationDocUrl: "https://storage.example.com/draft-doc-2",
        },
      ],
      usersToPurge: [
        {
          id: "user-purge",
          verificationDocUrl: "https://utfs.io/f/verification-doc-1",
        },
      ],
      deletedDrafts: [{ userId: "draft-shared" }],
      purgedUsers: [{ id: "user-purge" }],
    });

    const deleteVerificationDocument = vi.fn().mockResolvedValue(undefined);
    const result = await runPrivacyRetentionSweep(
      executor as never,
      now,
      deleteVerificationDocument,
    );

    expect(deleteVerificationDocument).toHaveBeenCalledTimes(1);
    expect(deleteVerificationDocument).toHaveBeenCalledWith(
      "verification-doc-1",
    );
    expect(result).toEqual({
      verificationDraftsDeleted: 1,
      verificationDraftProviderDeletionFailed: 0,
      verificationDraftProviderRetentionBlocked: 1,
      verificationEvidencePurged: 1,
      verificationProviderDeletionFailed: 0,
      verificationProviderRetentionBlocked: 0,
      sampleRequestsPurged: 0,
      shippingAddressesDeleted: 0,
    });
    expect(userUpdateValues).toContainEqual({
      einTaxId: null,
      einLast4: null,
      verificationDocUrl: null,
      verificationNotes: null,
      verificationDataPurgeAfter: null,
      verificationEvidencePurgedAt: now,
      updatedAt: now,
    });
  });

  it("leaves draft and user verification evidence due when provider deletion fails", async () => {
    const { executor } = createExecutor({
      draftReferences: [
        {
          userId: "draft-1",
          verificationDocUrl: "https://utfs.io/f/draft-doc-1",
        },
      ],
      userReferences: [
        {
          id: "user-1",
          verificationDocUrl: "https://utfs.io/f/verification-doc-1",
        },
      ],
      draftsToPurge: [
        {
          userId: "draft-1",
          verificationDocUrl: "https://utfs.io/f/draft-doc-1",
        },
      ],
      usersToPurge: [
        {
          id: "user-1",
          verificationDocUrl: "https://utfs.io/f/verification-doc-1",
        },
      ],
    });

    const deleteVerificationDocument = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));
    const result = await runPrivacyRetentionSweep(
      executor as never,
      new Date("2026-08-03T15:00:00.000Z"),
      deleteVerificationDocument,
    );

    expect(deleteVerificationDocument).toHaveBeenCalledWith("draft-doc-1");
    expect(deleteVerificationDocument).toHaveBeenCalledWith(
      "verification-doc-1",
    );
    expect(result).toEqual({
      verificationDraftsDeleted: 0,
      verificationDraftProviderDeletionFailed: 1,
      verificationDraftProviderRetentionBlocked: 0,
      verificationEvidencePurged: 0,
      verificationProviderDeletionFailed: 1,
      verificationProviderRetentionBlocked: 0,
      sampleRequestsPurged: 0,
      shippingAddressesDeleted: 0,
    });
  });

  it("keeps every due database reference when one shared provider deletion fails", async () => {
    const sharedDocumentUrl = "https://utfs.io/f/shared-due-document";
    const { executor } = createExecutor({
      draftReferences: [
        {
          userId: "same-subject",
          verificationDocUrl: sharedDocumentUrl,
        },
      ],
      userReferences: [
        {
          id: "same-subject",
          verificationDocUrl: sharedDocumentUrl,
        },
      ],
      draftsToPurge: [
        {
          userId: "same-subject",
          verificationDocUrl: sharedDocumentUrl,
        },
      ],
      usersToPurge: [
        {
          id: "same-subject",
          verificationDocUrl: sharedDocumentUrl,
        },
      ],
    });

    const deleteVerificationDocument = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));
    const result = await runPrivacyRetentionSweep(
      executor as never,
      new Date("2026-08-03T15:00:00.000Z"),
      deleteVerificationDocument,
    );

    expect(deleteVerificationDocument).toHaveBeenCalledTimes(1);
    expect(deleteVerificationDocument).toHaveBeenCalledWith(
      "shared-due-document",
    );
    expect(result).toMatchObject({
      verificationDraftsDeleted: 0,
      verificationDraftProviderDeletionFailed: 1,
      verificationEvidencePurged: 0,
      verificationProviderDeletionFailed: 1,
    });
  });
});
