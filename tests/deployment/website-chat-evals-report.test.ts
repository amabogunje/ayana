import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runWebsiteChatEvalScenario, summarizeWebsiteChatEvalResults } from "@/lib/chat-evals/runner";
import { websiteChatEvalScenarios } from "@/lib/chat-evals/scenarios";
import { createTableOption, createVenue, deleteVenueData } from "../helpers/db";

describe("deployment website chat eval report", () => {
  let venueId: string | null = null;

  afterAll(async () => {
    if (venueId) {
      await deleteVenueData(venueId);
    }
  });

  it("generates the latest website chat eval report without resetting the database", async () => {
    const staleEvalVenues = await prisma.venue.findMany({
      where: {
        slug: {
          startsWith: "chat-eval-deploy-",
        },
      },
      select: { id: true },
    });

    for (const staleVenue of staleEvalVenues) {
      await deleteVenueData(staleVenue.id);
    }

    const seedSuffix = `deploy-${Date.now()}`;
    const venue = await createVenue({
      slug: `chat-eval-${seedSuffix}`,
      name: "Bleu Martini",
      brandTone: "polished, warm, and sales-forward",
      depositPolicy: "A deposit is required to hold the table.",
      websiteChatAllowedOrigins: "https://bleumartini.example.com",
      websiteChatWidgetKey: `wc_${seedSuffix.replace(/[^a-z0-9]/gi, "")}`,
    });
    venueId = venue.id;

    try {
      await createTableOption(venue.id, {
        name: "VIP Booth",
        code: `VIPB-${seedSuffix}`,
        minSpendCents: 100_000,
        depositAmountCents: 25_000,
        capacityMin: 2,
        capacityMax: 4,
        description: "Main room booth with strong visibility.",
      });
      await createTableOption(venue.id, {
        name: "Main Floor Table",
        code: `MFT-${seedSuffix}`,
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

      const useOpenAiGuest = process.env.CHAT_EVAL_USE_OPENAI_DEPLOY === "1";
      const useOpenAiJudge = process.env.CHAT_EVAL_USE_OPENAI_JUDGE_DEPLOY === "1";

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

      const reportsDir = path.join(process.cwd(), "reports", "chat-evals");
      await mkdir(reportsDir, { recursive: true });
      await writeFile(path.join(reportsDir, "latest.json"), JSON.stringify(report, null, 2), "utf8");

      expect(report.scenarioCount).toBe(websiteChatEvalScenarios.length);
      expect(report.results.every((result) => result.transcript.length >= 2)).toBe(true);
    } finally {
      if (venueId) {
        await deleteVenueData(venueId);
        venueId = null;
      }
    }
  }, 60_000);
});
