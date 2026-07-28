import { NextRequest, NextResponse } from "next/server";
import { parseIncomingWebhook } from "@/lib/whatsapp";
import { handleIncomingMessage } from "@/lib/bookingBot";

// Meta calls this once, when you save the webhook URL in the App Dashboard,
// to prove you control the endpoint.
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// Meta calls this for every inbound message / status update.
export async function POST(req: NextRequest) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Always ack quickly with 200 so Meta doesn't retry/backoff; do the actual
  // work after we've parsed the messages out.
  const messages = parseIncomingWebhook(payload);

  await Promise.allSettled(
    messages
      // Keep it if there's text OR an image (a plain photo with no caption
      // has empty text but still needs to reach the bot).
      .filter((m) => m.text.length > 0 || m.image)
      .map((m) => handleIncomingMessage(m))
  );

  return NextResponse.json({ ok: true });
}
