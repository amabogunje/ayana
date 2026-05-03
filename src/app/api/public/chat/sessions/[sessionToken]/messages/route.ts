import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addWebsiteChatGuestMessage, listWebsiteChatMessages } from "@/lib/website-chat-service";

const createWebsiteChatMessageSchema = z.object({
  origin: z.string().optional(),
  content: z.string().min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionToken: string }> },
) {
  try {
    const { sessionToken } = await params;
    const origin = request.nextUrl.searchParams.get("origin");
    const session = await listWebsiteChatMessages(sessionToken, origin);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load website chat messages.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionToken: string }> },
) {
  try {
    const { sessionToken } = await params;
    const body = createWebsiteChatMessageSchema.parse(await request.json());
    const message = await addWebsiteChatGuestMessage({
      sessionToken,
      origin: body.origin,
      content: body.content,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send website chat message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
