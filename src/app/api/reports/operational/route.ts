import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { formatReportTimestamp, listOperationalReportAll, toCsv } from "@/lib/reports";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const venue = searchParams.get("venue") ?? undefined;
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;

  const rows = await listOperationalReportAll({
    venueSlug: venue,
    startDate: start,
    endDate: end,
  });

  const csv = toCsv([
    ["Timestamp", "Venue", "Actor", "Action", "Summary"],
    ...rows.map((item) => [
      formatReportTimestamp(item.createdAt),
      item.venue?.name ?? "",
      item.actor?.fullName ?? "System",
      item.action,
      item.summary,
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="operational-history.csv"',
    },
  });
}
