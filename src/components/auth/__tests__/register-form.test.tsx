import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "@/app/(auth)/register/page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: mockRefresh })),
  useSearchParams: vi.fn(() => ({ get: vi.fn(() => null) })),
}));

const mockMutateAsync = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    auth: {
      register: {
        useMutation: vi.fn(() => ({
          mutateAsync: mockMutateAsync,
        })),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill every required field with valid data. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
  await user.type(screen.getByLabelText(/business name/i), "Doe Lumber Co");
  await user.type(screen.getByLabelText(/business email/i), "jane@example.com");
  await user.type(screen.getByLabelText(/zip code/i), "97201");
  await user.type(screen.getByLabelText(/^password$/i), "secureP@ss1");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  // 1. Renders all required form fields
  it("renders all required form fields", () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/business email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zip code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  // 2. Shows buyer account title by default
  it("shows buyer account title by default", () => {
    render(<RegisterPage />);

    // CardTitle renders as a <div>, not a heading element
    expect(
      screen.getByText(/create your buyer account/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create buyer account/i }),
    ).toBeInTheDocument();
  });

  // 3. Shows seller account title when "Sell Flooring" clicked
  it('shows seller account title when "Sell Flooring" is clicked', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.click(screen.getByText(/sell flooring/i));

    expect(
      screen.getByText(/create your seller account/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create seller account/i }),
    ).toBeInTheDocument();
  });

  // 4. Shows validation error for short password
  it("shows validation error for password shorter than 8 characters", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/business name/i), "Doe Lumber Co");
    await user.type(
      screen.getByLabelText(/business email/i),
      "jane@example.com",
    );
    await user.type(screen.getByLabelText(/zip code/i), "97201");
    await user.type(screen.getByLabelText(/^password$/i), "short");

    await user.click(
      screen.getByRole("button", { name: /create buyer account/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 8 characters/i),
      ).toBeInTheDocument();
    });
  });

  // 5. Shows validation error for invalid email
  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/business name/i), "Doe Lumber Co");
    await user.type(screen.getByLabelText(/business email/i), "not-an-email");
    await user.type(screen.getByLabelText(/zip code/i), "97201");
    await user.type(screen.getByLabelText(/^password$/i), "secureP@ss1");

    // Use fireEvent.submit to bypass native HTML5 email validation in jsdom,
    // allowing react-hook-form + zod validation to run.
    const form = screen.getByRole("button", { name: /create buyer account/i })
      .closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText(/please enter a valid email/i),
      ).toBeInTheDocument();
    });
  });

  // 6. Shows validation error for invalid zip code
  it("shows validation error for invalid zip code", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/business name/i), "Doe Lumber Co");
    await user.type(
      screen.getByLabelText(/business email/i),
      "jane@example.com",
    );
    await user.type(screen.getByLabelText(/zip code/i), "123"); // too short
    await user.type(screen.getByLabelText(/^password$/i), "secureP@ss1");

    await user.click(
      screen.getByRole("button", { name: /create buyer account/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/zip code must be 5 digits/i),
      ).toBeInTheDocument();
    });
  });

  // 7. Calls register mutation on valid submit
  it("calls register mutation with correct data on valid submit", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillValidForm(user);

    await user.click(
      screen.getByRole("button", { name: /create buyer account/i }),
    );

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jane Doe",
          businessName: "Doe Lumber Co",
          email: "jane@example.com",
          zipCode: "97201",
          password: "secureP@ss1",
          role: "buyer",
        }),
      );
    });
  });

  // 8. Shows loading state during submission
  it("disables submit button while loading", async () => {
    // Make mutation hang indefinitely so we can observe loading state
    mockMutateAsync.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillValidForm(user);

    await user.click(
      screen.getByRole("button", { name: /create buyer account/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create buyer account/i }),
      ).toBeDisabled();
    });
  });

  // 9. Handles server error (mutation rejection)
  it("shows toast error when mutation fails", async () => {
    const { toast } = await import("sonner");

    mockMutateAsync.mockRejectedValue(new Error("Email already registered"));

    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillValidForm(user);

    await user.click(
      screen.getByRole("button", { name: /create buyer account/i }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Email already registered");
    });
  });

  // 10. Has link to login page
  it("has a link to the login page", () => {
    render(<RegisterPage />);

    const signInLink = screen.getByRole("link", { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute("href", "/login");
  });
});
