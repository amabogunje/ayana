import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const leadSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required.").max(120),
  email: z.string().trim().email("A valid email is required.").max(160),
  phone: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(40).optional(),
  ),
  venueName: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(160).optional(),
  ),
  role: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(["owner", "manager", "promoter", "other"]).optional(),
  ),
});

export async function POST(request: NextRequest) {
  try {
    const body = leadSchema.parse(await request.json());
    const lead = await prisma.pilotLead.create({
      data: {
        fullName: body.fullName,
        email: body.email.toLowerCase(),
        phone: body.phone ?? null,
        venueName: body.venueName ?? null,
        role: body.role ?? null,
        source: "landing_page",
      },
    });

    return NextResponse.json({ leadId: lead.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit pilot request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
