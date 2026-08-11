import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Heart } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";

describe("dashboard state panels", () => {
  it("provides an assertive, retryable error state and a safe next action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <QueryErrorState
        title="We couldn't load your orders"
        onRetry={onRetry}
        secondaryAction={{ label: "Browse listings", href: "/listings" }}
      />,
    );

    expect(
      screen.getByRole("alert", { name: "We couldn't load your orders" }),
    ).toHaveAttribute("aria-live", "assertive");
    expect(
      screen.getByRole("link", { name: "Browse listings" }),
    ).toHaveAttribute("href", "/listings");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("gives empty states a clear primary next step", () => {
    render(
      <StatePanel
        icon={Heart}
        title="Save promising lots for later"
        description="Build a shortlist and return when you are ready."
        primaryAction={{ label: "Browse listings", href: "/listings" }}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Save promising lots for later" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse listings" }),
    ).toHaveAttribute("href", "/listings");
  });

  it("announces contextual loading without presenting inert controls", () => {
    render(<StatePanelLoading label="Loading saved listings" rows={2} />);

    const loadingState = screen.getByRole("status", {
      name: "Loading saved listings",
    });
    expect(loadingState).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the legacy empty-state action as one valid link control", () => {
    render(
      <EmptyState
        icon={Heart}
        title="Nothing saved"
        description="Save a listing to see it here."
        action={{ label: "Browse listings", href: "/listings" }}
      />,
    );

    const action = screen.getByRole("link", { name: "Browse listings" });
    expect(action).toHaveAttribute("href", "/listings");
    expect(action.querySelector("button")).toBeNull();
  });
});
