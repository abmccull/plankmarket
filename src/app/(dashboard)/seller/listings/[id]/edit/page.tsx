"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EditListingPage() {
  const params = useParams();
  const listingId = params.id as string;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Edit Listing</h1>
      <Card>
        <CardHeader>
          <CardTitle>Listing Editor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Editing listing {listingId}. The full edit form shares the same
            component as the create form and will be connected in a follow-up
            iteration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
