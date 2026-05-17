import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listAgentRunInspection } from "@/lib/agent/agent-run-inspection-service";
import { createInquiry, createVenue, resetDatabase } from "../helpers/db";

describe("agent run inspection service", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists recent agent runs with tool calls and applies filters", async () => {
    const venue = await createVenue({ name: "Inspection Room", slug: "inspection-room" });
    const otherVenue = await createVenue({ name: "Other Room", slug: "other-room" });
    const inquiry = await createInquiry(venue.id, { guestName: "Trace Guest" });
    await createInquiry(otherVenue.id, { guestName: "Other Guest" });

    const run = await prisma.agentRun.create({
      data: {
        venueId: venue.id,
        inquiryId: inquiry.id,
        channel: "WEBSITE_CHAT",
        source: "website_chat_agent",
        status: "COMPLETED",
        model: "gpt-test",
        intent: "book_table",
        objective: "send_deposit",
        conversationMode: "close",
        confidence: 0.82,
        finalAction: "Deposit checkout sent for VIP Booth.",
        resultSummary: "Sent deposit checkout for VIP Booth.",
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 1200,
      },
    });
    await prisma.agentToolCall.create({
      data: {
        agentRunId: run.id,
        venueId: venue.id,
        inquiryId: inquiry.id,
        toolName: "createReservation",
        status: "COMPLETED",
        inputSummary: "policy=allowed; hasPhone=true",
        outputSummary: "Reservation created with deposit checkout URL present.",
        durationMs: 20,
      },
    });
    await prisma.agentRun.create({
      data: {
        venueId: otherVenue.id,
        channel: "WEBSITE_CHAT",
        status: "FAILED",
        source: "website_chat_agent",
        errorMessage: "Synthetic failure.",
        startedAt: new Date(),
      },
    });

    const result = await listAgentRunInspection({
      venueId: venue.id,
      inquiryId: inquiry.id,
      status: "COMPLETED",
      window: "24h",
    });

    expect(result.filters).toMatchObject({
      venueId: venue.id,
      inquiryId: inquiry.id,
      status: "COMPLETED",
      window: "24h",
    });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].venue.slug).toBe("inspection-room");
    expect(result.runs[0].inquiry?.guestName).toBe("Trace Guest");
    expect(result.runs[0].toolCalls[0].toolName).toBe("createReservation");
    expect(result.runs[0].toolCalls[0].inputSummary).toBe("policy=allowed; hasPhone=true");
    expect(result.statusCounts.find((item) => item.status === "COMPLETED")?.count).toBeGreaterThanOrEqual(1);
  });
});

