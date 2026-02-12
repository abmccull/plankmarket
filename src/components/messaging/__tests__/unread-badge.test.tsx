import { render, screen } from "@testing-library/react";
import { UnreadBadge } from "../unread-badge";

describe("UnreadBadge", () => {
  it("should not render when count is 0", () => {
    const { container } = render(<UnreadBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render count when greater than 0", () => {
    render(<UnreadBadge count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it('should render "99+" when count exceeds 99', () => {
    render(<UnreadBadge count={100} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <UnreadBadge count={3} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
