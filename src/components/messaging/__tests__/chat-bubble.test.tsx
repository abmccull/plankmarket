import { render, screen } from "@testing-library/react";
import { ChatBubble } from "../chat-bubble";

describe("ChatBubble", () => {
  const defaultProps = {
    message: "Hello, world!",
    senderName: "John Doe",
    timestamp: new Date("2024-01-01T12:00:00Z"),
    isCurrentUser: false,
    showSenderInfo: true,
  };

  it("should render message text", () => {
    render(<ChatBubble {...defaultProps} />);
    expect(screen.getByText("Hello, world!")).toBeInTheDocument();
  });

  it("should show sender name when showSenderInfo is true", () => {
    render(<ChatBubble {...defaultProps} />);
    expect(screen.getAllByText("John Doe")).toHaveLength(1);
  });

  it("should not show sender name when showSenderInfo is false", () => {
    render(<ChatBubble {...defaultProps} showSenderInfo={false} />);
    const senderElements = screen.queryAllByText("John Doe");
    expect(senderElements).toHaveLength(0);
  });

  it("should apply correct styling for current user messages", () => {
    const { container } = render(
      <ChatBubble {...defaultProps} isCurrentUser={true} />
    );
    const bubble = container.querySelector(".bg-primary");
    expect(bubble).toBeInTheDocument();
  });

  it("should apply correct styling for other user messages", () => {
    const { container } = render(
      <ChatBubble {...defaultProps} isCurrentUser={false} />
    );
    const bubble = container.querySelector(".bg-muted");
    expect(bubble).toBeInTheDocument();
  });

  it("should preserve line breaks in message text", () => {
    render(<ChatBubble {...defaultProps} message="Line 1\nLine 2" />);
    const messageElement = screen.getByText(/Line 1/);
    expect(messageElement).toHaveClass("whitespace-pre-wrap");
  });
});
