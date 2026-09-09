import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const userCount = await db.user.count();
    return NextResponse.json({
      status: "ok",
      platform: "UJRIS Justice Intelligence",
      time: new Date().toISOString(),
      database: { status: "connected", users: userCount },
    });
  } catch (error) {
    return NextResponse.json(
      { status: "degraded", error: error instanceof Error ? error.message : "unknown error" },
      { status: 503 }
    );
  }
}
