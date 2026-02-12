import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail } from "lucide-react";

export default function VerifyPage() {
  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Check Your Email</CardTitle>
        <CardDescription>
          We have sent a verification link to your email address. Please click
          the link to verify your account and get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Did not receive the email? Check your spam folder or contact support.
        </p>
      </CardContent>
    </Card>
  );
}
