import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const records = vi.hoisted(() => [{ id: "one", url: "/one.jpg", fileName: "One" }, { id: "two", url: "/two.jpg", fileName: "Two" }]);
vi.mock("@/lib/trpc/client", () => ({ trpc: { upload: { getOwnedMedia: { useQuery: () => ({ data: records, isLoading: false, error: null }) } } } }));
vi.mock("@/lib/uploadthing", () => ({ useUploadThing: () => ({ startUpload: vi.fn() }) }));
// Image loading is outside this state-transition test.
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
import { PhotoUpload } from "../photo-upload";
describe("saved listing photos", () => {
 it("restores owned photos and only stages reordering/removal without form submission", async () => {
  const changed = vi.fn(), submitted = vi.fn((event) => event.preventDefault());
  render(<form onSubmit={submitted}><PhotoUpload initialMediaIds={["one", "two"]} onImagesChange={changed} /></form>);
  expect(await screen.findByAltText("One")).toBeInTheDocument();
  fireEvent.click(screen.getAllByLabelText("Move image down")[0]);
  expect(changed).toHaveBeenLastCalledWith(["two", "one"]);
  fireEvent.click(screen.getByLabelText("Delete One"));
  expect(changed).toHaveBeenLastCalledWith(["two"]);
  expect(submitted).not.toHaveBeenCalled();
 });
});
