import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "../message-input";

describe("MessageInput", () => {
  const mockOnSendMessage = vi.fn();

  beforeEach(() => {
    mockOnSendMessage.mockClear();
  });

  it("should render textarea and send button", () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    expect(
      screen.getByPlaceholderText("Type your message...")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("should disable send button when input is empty", () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const sendButton = screen.getByLabelText("Send message");
    expect(sendButton).toBeDisabled();
  });

  it("should enable send button when input has text", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText("Type your message...");
    const sendButton = screen.getByLabelText("Send message");

    await user.type(textarea, "Hello");

    expect(sendButton).toBeEnabled();
  });

  it("should call onSendMessage when send button is clicked", async () => {
    const user = userEvent.setup();
    mockOnSendMessage.mockResolvedValue(undefined);

    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText("Type your message...");
    const sendButton = screen.getByLabelText("Send message");

    await user.type(textarea, "Test message");
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockOnSendMessage).toHaveBeenCalledWith("Test message");
    });
  });

  it("should clear input after sending message", async () => {
    const user = userEvent.setup();
    mockOnSendMessage.mockResolvedValue(undefined);

    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText(
      "Type your message..."
    ) as HTMLTextAreaElement;

    await user.type(textarea, "Test message");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("should send message on Enter key press", async () => {
    const user = userEvent.setup();
    mockOnSendMessage.mockResolvedValue(undefined);

    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText("Type your message...");

    await user.type(textarea, "Test message{Enter}");

    await waitFor(() => {
      expect(mockOnSendMessage).toHaveBeenCalledWith("Test message");
    });
  });

  it("should add newline on Shift+Enter", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText(
      "Type your message..."
    ) as HTMLTextAreaElement;

    await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");

    expect(textarea.value).toContain("\n");
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it("should not send empty or whitespace-only messages", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText("Type your message...");

    await user.type(textarea, "   {Enter}");

    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it("should respect maxLength of 2000 characters", () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText(
      "Type your message..."
    ) as HTMLTextAreaElement;

    expect(textarea.maxLength).toBe(2000);
  });

  it("should disable input when disabled prop is true", () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} disabled={true} />);
    const textarea = screen.getByPlaceholderText("Type your message...");
    const sendButton = screen.getByLabelText("Send message");

    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});
