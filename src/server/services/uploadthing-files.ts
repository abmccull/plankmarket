import { UTApi } from "uploadthing/server";

type UploadThingDeleteClient = Pick<UTApi, "deleteFiles">;

export async function deleteUploadThingFile(
  key: string,
  client: UploadThingDeleteClient = new UTApi(),
): Promise<void> {
  const result = await client.deleteFiles(key);
  if (!result.success) {
    throw new Error("UploadThing did not confirm file deletion");
  }
  // success with deletedCount=0 is intentionally idempotent: the object was
  // already absent, so local metadata can still be removed safely.
}

export async function deleteMediaWithProvider(params: {
  key: string | null;
  deleteRemote?: (key: string) => Promise<void>;
  deleteMetadata: () => Promise<void>;
}): Promise<void> {
  const deleteRemote = params.deleteRemote ?? deleteUploadThingFile;
  if (params.key) {
    await deleteRemote(params.key);
  }
  await params.deleteMetadata();
}
