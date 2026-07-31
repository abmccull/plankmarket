import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import WelcomeEmail from "@/emails/welcome";

describe("React Email runtime dependency", () => {
  it("renders a transactional email without relying on a nested optional peer", async () => {
    const html = await render(
      React.createElement(WelcomeEmail, {
        name: "Launch Test",
        role: "buyer",
        dashboardUrl: "https://example.com/buyer",
      }),
    );

    expect(html).toContain("Launch Test");
    expect(html).toContain("https://example.com/buyer");
  });
});
