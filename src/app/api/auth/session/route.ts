import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ user: null });
    return json({ user });
  } catch (error) {
    return handleError(error);
  }
}
