"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/lib/stores/auth-store";

interface ProfileField {
  label: string;
  getValue: (user: NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>) => unknown;
}

const PROFILE_FIELDS: ProfileField[] = [
  { label: "Name", getValue: (user) => user.name },
  { label: "Email", getValue: (user) => user.email },
  { label: "Business name", getValue: (user) => user.businessName },
  { label: "Avatar", getValue: (user) => user.avatarUrl },
];

function calculateCompleteness(
  user: NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>
): { percentage: number; missingFields: string[] } {
  let completedCount = 0;
  const missingFields: string[] = [];

  for (const field of PROFILE_FIELDS) {
    const value = field.getValue(user);
    if (value && value !== "") {
      completedCount += 1;
    } else {
      missingFields.push(field.label);
    }
  }

  return {
    percentage: Math.round((completedCount / PROFILE_FIELDS.length) * 100),
    missingFields,
  };
}

export function ProfileCompleteness() {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return null;
  }

  const { percentage, missingFields } = calculateCompleteness(user);

  if (percentage === 100) {
    return null;
  }

  const settingsHref = user.role === "seller" ? "/seller/settings" : "/buyer/settings";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Complete Your Profile</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {percentage}% complete
            </span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>

        {missingFields.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Missing fields:
            </p>
            <ul className="text-sm space-y-1">
              {missingFields.map((field) => (
                <li key={field} className="text-muted-foreground">
                  • {field}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button asChild className="w-full">
          <Link href={settingsHref}>Complete Profile</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
