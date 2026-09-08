import { expect, it } from "vitest";
import { adminItems } from "../admin-navigation";
it("keeps exception management and shipment routes in the shared admin menu", () => {
  const paths = adminItems.map(item => item.href);
  expect(new Set(paths).size).toBe(paths.length);
  for (const path of ["/admin/finance", "/admin/disputes", "/admin/reconciliation", "/admin/users", "/admin/inventory", "/admin/shipments"]) expect(paths).toContain(path);
});
