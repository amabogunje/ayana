import { getPlatformConfig, getResolvedOpenAIApiKey } from "@/lib/platform-config";
import { addWebsiteChatGuestMessage, listWebsiteChatMessages, startWebsiteChatSession } from "@/lib/website-chat-service";
import { scoreWebsiteChatTranscript } from "@/lib/chat-evals/scoring";
import type { ChatEvalReport, ChatEvalScenario, ChatEvalScenarioResult } from "@/lib/chat-evals/types";

type RunScenarioInput = {
  scenario: ChatEvalScenario;
  widgetKey: string;
  origin: string;
  venueName: string;
  configuredTableNames: string[];
  useOpenAiGuest?: boolean;
  useOpenAiJudge?: boolean;
};

type OpenAiGuestTurn = {
  message: string | null;
  done: boolean;
  reason: string;
};

async function resolveEvalOpenAiKey() {
  const platformConfig = await getPlatformConfig();
  return getResolvedOpenAIApiKey(platformConfig.openAIApiKey);
}

async function generateOpenAiGuestTurn(input: {
  scenario: ChatEvalScenario;
  transcript: Array<{ authorRole: string; content: string }>;
  venueName: string;
}) {
  const apiKey = await resolveEvalOpenAiKey();
  if (!apiKey) {
    return null;
  }

  const transcript = input.transcript
    .map((message) => `${message.authorRole.toUpperCase()}: ${message.content}`)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "website_chat_eval_guest_turn",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              message: { type: ["string", "null"] },
              done: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["message", "done", "reason"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            `You are simulating a nightlife customer chatting with ${input.venueName}. ` +
            `${input.scenario.guestPersonaPrompt} ` +
            `Stay realistic, concise, and human. Do not help the bot. Stop once your goal is satisfied or the conversation is clearly stuck.`,
        },
        {
          role: "user",
          content:
            `Scenario: ${input.scenario.title}\n` +
            `Description: ${input.scenario.description}\n` +
            `Success criteria:\n- ${input.scenario.successCriteria.join("\n- ")}\n\n` +
            `Transcript so far:\n${transcript}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  return JSON.parse(content) as OpenAiGuestTurn;
}

async function judgeWithOpenAi(input: {
  scenario: ChatEvalScenario;
  transcript: Array<{ authorRole: string; content: string }>;
  deterministicScore: number;
}) {
  const apiKey = await resolveEvalOpenAiKey();
  if (!apiKey) {
    return null;
  }

  const transcript = input.transcript
    .map((message) => `${message.authorRole.toUpperCase()}: ${message.content}`)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "website_chat_eval_judge",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              score: { type: "number" },
              feedback: { type: "string" },
            },
            required: ["score", "feedback"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You are judging a venue booking chatbot transcript. Score conversational quality from 0 to 100. Focus on fluency, answering the latest question, avoiding repetition, staying truthful to the configured offer, and moving naturally toward a booking close.",
        },
        {
          role: "user",
          content:
            `Scenario: ${input.scenario.title}\n` +
            `Success criteria:\n- ${input.scenario.successCriteria.join("\n- ")}\n` +
            `Deterministic score: ${input.deterministicScore}\n\n` +
            `Transcript:\n${transcript}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  return JSON.parse(content) as { score: number; feedback: string };
}

export async function runWebsiteChatEvalScenario(input: RunScenarioInput): Promise<ChatEvalScenarioResult> {
  const start = await startWebsiteChatSession({
    widgetKey: input.widgetKey,
    origin: input.origin,
    guestName: input.scenario.guestName,
    message: input.scenario.openingMessage ?? null,
  });

  let transcript = start.messages.map((message) => ({
    authorRole: message.authorRole,
    content: message.content,
  }));

  const maxTurns = input.scenario.maxTurns ?? Math.max(4, input.scenario.scriptedGuestMessages.length + 1);
  let scriptedIndex = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    let guestTurn: OpenAiGuestTurn | null = null;

    if (input.useOpenAiGuest) {
      guestTurn = await generateOpenAiGuestTurn({
        scenario: input.scenario,
        transcript,
        venueName: input.venueName,
      });
    }

    const nextMessage =
      guestTurn?.done
        ? null
        : guestTurn?.message?.trim()
          ? guestTurn.message.trim()
          : input.scenario.scriptedGuestMessages[scriptedIndex] ?? null;

    if (!nextMessage) {
      break;
    }

    scriptedIndex += guestTurn?.message?.trim() ? 0 : 1;

    await addWebsiteChatGuestMessage({
      sessionToken: start.sessionToken,
      origin: input.origin,
      content: nextMessage,
    });

    const listed = await listWebsiteChatMessages(start.sessionToken, input.origin);
    transcript = listed.messages.map((message) => ({
      authorRole: message.authorRole,
      content: message.content,
    }));

    const latestAiMessage = [...transcript].reverse().find((message) => message.authorRole === "ai")?.content ?? "";
    const scriptedMessagesRemaining = scriptedIndex < input.scenario.scriptedGuestMessages.length;
    if (/https?:\/\//i.test(latestAiMessage) || (/deposit link/i.test(latestAiMessage) && !scriptedMessagesRemaining)) {
      break;
    }

    if (guestTurn?.done) {
      break;
    }
  }

  const deterministic = scoreWebsiteChatTranscript({
    scenario: input.scenario,
    transcript,
    venueName: input.venueName,
    configuredTableNames: input.configuredTableNames,
  });

  const llmJudge = input.useOpenAiJudge
    ? await judgeWithOpenAi({
        scenario: input.scenario,
        transcript,
        deterministicScore: deterministic.score,
      })
    : null;

  return {
    ...deterministic,
    mode: input.useOpenAiGuest ? "openai" : "scripted",
    llmJudge,
  };
}

export function summarizeWebsiteChatEvalResults(input: {
  venueName: string;
  mode: "scripted" | "openai";
  results: ChatEvalScenarioResult[];
}): ChatEvalReport {
  const passCount = input.results.filter((result) => result.passed).length;
  const averageScore =
    input.results.length > 0
      ? Math.round(input.results.reduce((sum, result) => sum + result.score, 0) / input.results.length)
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    venueName: input.venueName,
    mode: input.mode,
    scenarioCount: input.results.length,
    passCount,
    averageScore,
    results: input.results,
  };
}
