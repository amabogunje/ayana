export type ChatEvalScenarioCheckResult = {
  name: string;
  passed: boolean;
  detail: string;
  weight?: number;
};

export type ChatEvalScenarioResult = {
  scenarioId: string;
  title: string;
  mode: "scripted" | "openai";
  passed: boolean;
  score: number;
  checks: ChatEvalScenarioCheckResult[];
  transcript: Array<{
    authorRole: string;
    content: string;
  }>;
  summary: string;
  llmJudge?: {
    score: number;
    feedback: string;
  } | null;
};

export type ChatEvalReport = {
  generatedAt: string;
  mode: "scripted" | "openai";
  venueName: string;
  scenarioCount: number;
  passCount: number;
  averageScore: number;
  results: ChatEvalScenarioResult[];
};

export type ChatEvalScenario = {
  id: string;
  title: string;
  description: string;
  guestName: string;
  openingMessage?: string | null;
  scriptedGuestMessages: string[];
  guestPersonaPrompt: string;
  successCriteria: string[];
  maxTurns?: number;
};
