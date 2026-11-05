import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { automatedAgent } from "@/lib/domain/email-tracking";

// 1×1 transparent GIF.
const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const headers = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "Content-Length": String(pixel.length),
  "Referrer-Policy": "no-referrer",
};

/** Open pixel of a tracked sequence email. Always answers the image, never an error page. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const token = z.uuid().safeParse((await params).token);
  if (token.success)
    await adminDb()
      .rpc("email_tracking_hit", {
        tracking: token.data,
        kind: "open",
        count_it: !automatedAgent(request.headers.get("user-agent")),
      })
      .then(
        () => undefined,
        () => undefined,
      );
  return new Response(pixel, { headers });
}
