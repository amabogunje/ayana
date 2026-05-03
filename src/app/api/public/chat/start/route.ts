import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startWebsiteChatSession } from "@/lib/website-chat-service";

const startWebsiteChatSchema = z.object({
  widgetKey: z.string().min(1),
  origin: z.string().optional(),
  guestName: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  requestedDateLabel: z.string().min(2).optional(),
  partySize: z.coerce.number().int().min(1).max(30).optional(),
  spendIntentLabel: z.string().min(2).optional(),
  spendIntentMinCents: z.coerce.number().int().nonnegative().optional(),
  spendIntentMaxCents: z.coerce.number().int().nonnegative().optional(),
  occasion: z.string().optional(),
  message: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = startWebsiteChatSchema.parse(await request.json());
    const session = await startWebsiteChatSession(body);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start website chat session.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
