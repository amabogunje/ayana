import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runWebsiteChatEvalScenario, summarizeWebsiteChatEvalResults } from "@/lib/chat-evals/runner";
import { websiteChatEvalScenarios } from "@/lib/chat-evals/scenarios";
import { createTableOption, createVenue, resetDatabase } from "../helpers/db";

describe("website chat eval harness", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("runs scenario-based website chat evals and writes a report", async () => {
    const venue = await createVenue({
      name: "Bleu Martini",
      brandTone: "polished, warm, and sales-forward",
      depositPolicy: "A deposit is required to hold the table.",
      websiteChatAllowedOrigins: "https://bleumartini.example.com",
    });

    await createTableOption(venue.id, {
      name: "VIP Booth",
      code: "VIPB",
      minSpendCents: 100_000,
      depositAmountCents: 25_000,
      capacityMin: 2,
      capacityMax: 4,
      description: "Main room booth with strong visibility.",
    });
    await createTableOption(venue.id, {
      name: "Main Floor Table",
      code: "MFT",
      minSpendCents: 150_000,
      depositAmountCents: 30_000,
      capacityMin: 5,
      capacityMax: 8,
      description: "Larger table on the main floor.",
    });

    const configuredTableNames = (await prisma.tableOption.findMany({
      where: { venueId: venue.id, active: true },
      orderBy: { minSpendCents: "asc" },
      select: { name: true },
    })).map((option) => option.name);

    const useOpenAiGuest = process.env.CHAT_EVAL_USE_OPENAI === "1";
    const useOpenAiJudge = process.env.CHAT_EVAL_USE_OPENAI_JUDGE === "1";

    const results = [];
    for (const scenario of websiteChatEvalScenarios) {
      results.push(
        await runWebsiteChatEvalScenario({
          scenario,
          widgetKey: venue.websiteChatWidgetKey!,
          origin: "https://bleumartini.example.com",
          venueName: venue.name,
          configuredTableNames,
          useOpenAiGuest,
          useOpenAiJudge,
        }),
      );
    }

    const report = summarizeWebsiteChatEvalResults({
      venueName: venue.name,
      mode: useOpenAiGuest ? "openai" : "scripted",
      results,
    });
    const agentRunCount = await prisma.agentRun.count({
      where: {
        venueId: venue.id,
        channel: "WEBSITE_CHAT",
      },
    });

    const reportsDir = path.join(process.cwd(), "reports", "chat-evals");
    await mkdir(reportsDir, { recursive: true });
    await writeFile(path.join(reportsDir, "latest.json"), JSON.stringify(report, null, 2), "utf8");

    expect(report.scenarioCount).toBe(websiteChatEvalScenarios.length);
    expect(report.results.every((result) => result.transcript.length >= 2)).toBe(true);
    expect(report.averageScore).toBeGreaterThanOrEqual(0);
    expect(agentRunCount).toBeGreaterThanOrEqual(websiteChatEvalScenarios.length);
    expect(report.results.flatMap((result) => result.checks).some((check) => check.name === "no_invented_discount")).toBe(true);
  }, 60_000);
});
