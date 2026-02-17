import { toast } from "sonner";

export function celebrateMilestone(title: string, description: string) {
  toast.success(title, {
    description,
    duration: 5000,
  });

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
