import { describe, expect, it } from "vitest";
import { operatorInquiryStatusSchema, operatorLoginSchema, operatorVenueSettingsSchema } from "@/lib/operator-validation";

describe("operator validation", () => {
  it("accepts valid login credentials", () => {
    expect(operatorLoginSchema.parse({ email: "ops@example.com", password: "demo1234" })).toEqual({
      email: "ops@example.com",
      password: "demo1234",
    });
  });

  it("rejects invalid inquiry statuses", () => {
    expect(() => operatorInquiryStatusSchema.parse({ status: "ARCHIVED" })).toThrow();
  });

  it("defaults optional venue settings fields", () => {
    const parsed = operatorVenueSettingsSchema.parse({
      city: "New York",
      timezone: "America/New_York",
      depositPolicy: "Required.",
    });

    expect(parsed.servesFood).toBe(false);
    expect(parsed.addressLine1).toBe("");
    expect(parsed.hoursSummary).toBe("");
  });
});
