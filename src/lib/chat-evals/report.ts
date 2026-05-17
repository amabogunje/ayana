import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChatEvalReport } from "@/lib/chat-evals/types";

export async function getLatestChatEvalReport(): Promise<ChatEvalReport | null> {
  const reportPath = path.join(process.cwd(), "reports", "chat-evals", "latest.json");

  try {
    const raw = await readFile(reportPath, "utf8");
    return JSON.parse(raw) as ChatEvalReport;
  } catch {
    return null;
  }
}
