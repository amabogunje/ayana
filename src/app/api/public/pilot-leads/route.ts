import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const leadSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required.").max(120),
  email: z.string().trim().email("A valid email is required.").max(160),
  venueName: z.string().trim().min(2, "Company or venue name is required.").max(160),
  role: z.enum(["owner", "manager", "promoter", "staff"]),
});

export async function POST(request: NextRequest) {
  try {
    const body = leadSchema.parse(await request.json());
    const leadId = randomUUID();
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO PilotLead (id, fullName, email, venueName, role, source, createdAt, updatedAt)
      VALUES (
        ${leadId},
        ${body.fullName},
        ${body.email.toLowerCase()},
        ${body.venueName},
        ${body.role},
        ${"landing_page"},
        ${now},
        ${now}
      )
    `;

    return NextResponse.json({ leadId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit pilot request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
