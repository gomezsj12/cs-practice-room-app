import { NextRequest } from "next/server";
import { createPwaIcon } from "@/lib/pwaIcon";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedSize = Number(searchParams.get("size") ?? "512");

  const size = requestedSize >= 512 ? 512 : 192;

  return createPwaIcon(size);
}