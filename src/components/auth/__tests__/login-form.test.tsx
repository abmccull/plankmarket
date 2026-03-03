import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import LoginPage from "@/app/(auth)/login/page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ setUser: vi.fn() })),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth/roles", () => ({
  getDashboardPath: vi.fn((role: string) => `/${role}`),
}));

vi.mock("@/lib/auth/safe-redirect", () => ({
  sanitizeRedirectPath: vi.fn((path: string | null) => path),
}));

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

describe("LoginPage", () => {
  const mockPush = vi.fn();
  const mockRefresh = vi.fn();
  const mockFetch = vi.fn();
  const mockSetUser = vi.fn();
  const mockSignInWithPassword = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      refresh: mockRefresh,
    } as unknown as ReturnType<typeof useRouter>);

    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(() => null),
    } as unknown as ReturnType<typeof useSearchParams>);

    vi.mocked(trpc.useUtils).mockReturnValue({
      auth: { getSession: { fetch: mockFetch } },
    } as unknown as ReturnType<typeof trpc.useUtils>);

    vi.mocked(createClient).mockReturnValue({
      auth: { signInWithPassword: mockSignInWithPassword },
    } as unknown as ReturnType<typeof createClient>);

    vi.mocked(useAuthStore.getState).mockReturnValue({
      setUser: mockSetUser,
    } as unknown as ReturnType<typeof useAuthStore.getState>);
  });

  // -----------------------------------------------------------------------
  // 1. Renders email and password fields
  // -----------------------------------------------------------------------
  it("renders email and password fields", () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("placeholder", "you@company.com");

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveAttribute("placeholder", "Enter your password");
  });

  // -----------------------------------------------------------------------
  // 2. Renders "Sign In" button
  // -----------------------------------------------------------------------
  it("renders the Sign In button", () => {
    render(<LoginPage />);

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toBeEnabled();
  });

  // -----------------------------------------------------------------------
  // 3. Shows validation error for empty email on submit
  // -----------------------------------------------------------------------
  it("shows validation error for empty email on submit", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, "somepassword");

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/please enter a valid email address/i)
      ).toBeInTheDocument();
    });

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Shows validation error for empty password on submit
  // -----------------------------------------------------------------------
  it("shows validation error for empty password on submit", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, "test@example.com");

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/password is required/i)
      ).toBeInTheDocument();
    });

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. Calls supabase signInWithPassword on valid submit
  // -----------------------------------------------------------------------
  it("calls supabase signInWithPassword on valid submit", async () => {
    const user = userEvent.setup();

    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockFetch.mockResolvedValue({
      isAuthenticated: true,
      user: { id: "u1", role: "buyer", name: "Test Buyer" },
    });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "buyer@example.com");
    await user.type(passwordInput, "securePassword1");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "buyer@example.com",
        password: "securePassword1",
      });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      expect(mockSetUser).toHaveBeenCalledWith({
        id: "u1",
        role: "buyer",
        name: "Test Buyer",
      });
      expect(toast.success).toHaveBeenCalledWith("Signed in successfully");
      expect(mockPush).toHaveBeenCalledWith("/buyer");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Shows loading state during submission (button disabled)
  // -----------------------------------------------------------------------
  it("shows loading state during submission", async () => {
    const user = userEvent.setup();

    // Never-resolving promise to keep the form in loading state
    mockSignInWithPassword.mockImplementation(
      () => new Promise(() => {})
    );

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "buyer@example.com");
    await user.type(passwordInput, "securePassword1");
    await user.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Shows error toast on invalid credentials
  // -----------------------------------------------------------------------
  it("shows error toast on invalid credentials", async () => {
    const user = userEvent.setup();

    // Supabase returns a plain object (not an Error instance).
    // getErrorMessage falls back to the default message for non-Error objects.
    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "wrong@example.com");
    await user.type(passwordInput, "badpassword");
    await user.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 8. Has link to register page
  // -----------------------------------------------------------------------
  it("has a link to the register page", () => {
    render(<LoginPage />);

    const registerLink = screen.getByRole("link", { name: /create one/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute("href", "/register");
  });
});
