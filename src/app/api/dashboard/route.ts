import { NextResponse } from "next/server";
import { getAdminOverview } from "@/lib/admin-service";

export async function GET() {
  const data = await getAdminOverview();
  return NextResponse.json(data);
}
