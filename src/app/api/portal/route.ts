import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/api/context";
import {
  portalSession,
  portalDirectory,
  portalListFilters,
  portalHeaders,
} from "@/lib/api/portals";
export async function GET(request: NextRequest) {
  try {
    const filters = portalListFilters.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { client } = await portalSession();
    return NextResponse.json(await portalDirectory(client, filters), { headers: portalHeaders });
  } catch (e) {
    const response = fail(e);
    Object.entries(portalHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
