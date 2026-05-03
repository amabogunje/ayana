import { NextRequest, NextResponse } from "next/server";
import { authenticateOperator, createOperatorSession } from "@/lib/operator-auth";
import { listOperatorPermissions } from "@/lib/operator-permissions";
import { operatorLoginSchema } from "@/lib/operator-validation";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let payload: { email: string; password: string };

    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      };
    }

    const input = operatorLoginSchema.parse(payload);
    const user = await authenticateOperator(input.email, input.password);

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = await createOperatorSession(user.id);

    return NextResponse.json({
      token,
      user,
      permissions: listOperatorPermissions(user.role),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign in.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
