import { describe, expect, it } from "vitest";
import { hasOperatorPermission, listOperatorPermissions } from "@/lib/operator-permissions";

describe("operator permissions", () => {
  it("allows owners to manage teams and settings", () => {
    expect(hasOperatorPermission("VENUE_OWNER", "team:manage")).toBe(true);
    expect(hasOperatorPermission("VENUE_OWNER", "settings:write")).toBe(true);
  });

  it("keeps agents out of manager-only controls", () => {
    expect(listOperatorPermissions("VENUE_AGENT")).toContain("inbox:write");
    expect(hasOperatorPermission("VENUE_AGENT", "team:manage")).toBe(false);
    expect(hasOperatorPermission("VENUE_AGENT", "settings:write")).toBe(false);
  });
});
