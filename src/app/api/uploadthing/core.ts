import { createUploadthing, type FileRouter } from "uploadthing/next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

const f = createUploadthing();

/**
 * UploadThing file router for PlankMarket
 * Handles image uploads for listing photos
 */
export const ourFileRouter = {
  listingImageUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 20,
    },
  })
    .middleware(async () => {
      // Auth check: verify user is authenticated and is a seller
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        throw new Error("Unauthorized - You must be logged in to upload images");
      }

      // Get the user from our database
      const dbUser = await db.query.users.findFirst({
        where: eq(users.authId, authUser.id),
      });

      if (!dbUser) {
        throw new Error("User not found in database");
      }

      // Verify user is a seller or admin
      if (dbUser.role !== "seller" && dbUser.role !== "admin") {
        throw new Error("Forbidden - Only sellers can upload listing images");
      }

      // Return userId to be available in onUploadComplete
      return { userId: dbUser.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This runs after upload completes on the server
      // We return the file info so the client can save it to the database
      console.log("Upload complete for userId:", metadata.userId);
      console.log("File URL:", file.url);

      // Return data to be available in client-side onClientUploadComplete
      return {
        url: file.url,
        key: file.key,
        name: file.name,
        size: file.size,
      };
    }),
  buyerRequestImageUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 5,
    },
  })
    .middleware(async () => {
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        throw new Error("Unauthorized - You must be logged in to upload images");
      }

      const dbUser = await db.query.users.findFirst({
        where: eq(users.authId, authUser.id),
      });

      if (!dbUser) {
        throw new Error("User not found in database");
      }

      if (dbUser.role !== "buyer" && dbUser.role !== "admin") {
        throw new Error("Forbidden - Only buyers can upload request reference images");
      }

      return { userId: dbUser.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Buyer request upload complete for userId:", metadata.userId);
      return {
        url: file.url,
        key: file.key,
        name: file.name,
        size: file.size,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
