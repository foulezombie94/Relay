import { NextRequest, NextResponse } from "next/server";
import { checkOrigin, fail } from "@/lib/api/context";
import {
  portalContext,
  portalDetail,
  portalDetailFilters,
  portalHeaders,
  portalDocument,
  postPortalMessage,
  portalMessageBody,
} from "@/lib/api/portals";
type P = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const response = fail(error);
  Object.entries(portalHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { id } = await params;
    const context = await portalContext(id);
    const document = req.nextUrl.searchParams.get("document");
    if (document)
      return NextResponse.redirect(await portalDocument(context, document), {
        headers: portalHeaders,
      });
    const filters = portalDetailFilters.parse(Object.fromEntries(req.nextUrl.searchParams));
    return NextResponse.json(
      { data: await portalDetail(context, filters) },
      { headers: portalHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { id } = await params;
    const context = await portalContext(id);
    return NextResponse.json(
      {
        data: await postPortalMessage(
          context,
          await portalMessageBody(req),
          req.headers.get("Idempotency-Key"),
        ),
      },
      { status: 201, headers: portalHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
