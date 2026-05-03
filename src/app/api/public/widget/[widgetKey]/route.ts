import { NextRequest, NextResponse } from "next/server";
import { getWebsiteChatWidgetConfig } from "@/lib/website-chat-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ widgetKey: string }> },
) {
  try {
    const { widgetKey } = await params;
    const origin = request.nextUrl.searchParams.get("origin");
    const config = await getWebsiteChatWidgetConfig(widgetKey, origin);
    return NextResponse.json({ config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load website chat widget.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
