import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { formatReportTimestamp, listTranscriptReportAll, toCsv } from "@/lib/reports";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const venue = searchParams.get("venue") ?? undefined;
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;

  const rows = await listTranscriptReportAll({
    venueSlug: venue,
    startDate: start,
    endDate: end,
  });

  const csv = toCsv([
    [
      "Requested",
      "Venue",
      "Guest",
      "Channel",
      "Status",
      "Party Size",
      "Spend Intent",
      "Last Message",
    ],
    ...rows.map((item) => [
      formatReportTimestamp(item.requestedAt),
      item.venue.name,
      item.guestName,
      item.channel,
      item.status,
      String(item.partySize),
      item.spendIntentLabel,
      item.messages[0]?.content ?? "",
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="transcript-history.csv"',
    },
  });
}
