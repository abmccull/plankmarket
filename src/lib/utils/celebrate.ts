import { toast } from "sonner";

function canRunConfetti(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (
    typeof navigator !== "undefined" &&
    /jsdom/i.test(navigator.userAgent) &&
    process.env.ENABLE_CONFETTI_IN_TESTS !== "1"
  ) {
    return false;
  }

  const canvas = document.createElement("canvas");
  if (typeof canvas.getContext !== "function") {
    return false;
  }

  return Boolean(canvas.getContext("2d"));
}

export function celebrateMilestone(title: string, description: string) {
  toast.success(title, {
    description,
    duration: 5000,
  });

  if (!canRunConfetti()) {
    return;
  }

  // Dynamic import of canvas-confetti for optional celebration effect
  import("canvas-confetti")
    .then((confettiModule) => {
      const confetti = confettiModule.default;
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    })
    .catch(() => {
      // canvas-confetti not installed, skip animation
    });
}
