// Thin wrapper around Meta's WhatsApp Cloud API.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v25.0";

function graphBaseUrl(): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}`;
}

function apiUrl(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  }
  return `${graphBaseUrl()}/${phoneNumberId}/messages`;
}

function requireToken(): string {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    throw new Error("WHATSAPP_TOKEN is not set");
  }
  return token;
}

async function callGraphApi(body: Record<string, unknown>) {
  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("WhatsApp send failed", res.status, errText);
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`);
  }

  return res.json();
}

/** Send a plain text WhatsApp message. `to` must be digits only, e.g. 15551234567. */
export async function sendWhatsAppText(to: string, body: string) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

/**
 * Send an image by URL (must be publicly fetchable — Meta's servers download
 * it directly, no auth header support). Used to forward a prescription photo
 * from the doctor to the patient.
 */
export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl, ...(caption ? { caption } : {}) },
  });
}

export interface ReplyButton {
  id: string; // becomes the incoming "text" when tapped — keep it matching whatever a typed reply would be (e.g. "book", "yes", "skip")
  title: string; // shown on the button, hard-capped at 20 chars by WhatsApp
}

export interface ListRow {
  id: string; // becomes the incoming "text" when tapped
  title: string; // hard-capped at 24 chars by WhatsApp
  description?: string; // hard-capped at 72 chars by WhatsApp
}

export interface ListSection {
  title?: string; // hard-capped at 24 chars by WhatsApp
  rows: ListRow[];
}

/** Up to 3 tappable quick-reply buttons under a body message. */
export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: ReplyButton[],
  footer?: string
) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

/** A single "Choose an option" button that opens a tappable list of up to 10 rows total. */
export async function sendWhatsAppList(
  to: string,
  body: string,
  buttonLabel: string,
  sections: ListSection[],
  footer?: string
) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        button: buttonLabel.slice(0, 20),
        sections: sections.map((s) => ({
          ...(s.title ? { title: s.title.slice(0, 24) } : {}),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: r.title.slice(0, 24),
            ...(r.description ? { description: r.description.slice(0, 72) } : {}),
          })),
        })),
      },
    },
  });
}

/**
 * Downloads media (e.g. a photo the doctor sent the bot) from Meta's Graph
 * API. This is a two-step process: first resolve the media id to a
 * short-lived download URL, then fetch that URL — both requests need the
 * same bearer token.
 */
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = requireToken();

  const metaRes = await fetch(`${graphBaseUrl()}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to resolve media URL: ${metaRes.status} ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("Media metadata response had no url");

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) {
    throw new Error(`Failed to download media: ${fileRes.status}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: meta.mime_type || fileRes.headers.get("content-type") || "application/octet-stream",
  };
}

// ---------------------------------------------------------------------------
// Incoming webhook payload parsing
// ---------------------------------------------------------------------------

export interface IncomingWhatsAppMessage {
  from: string; // sender phone number, digits only
  id: string; // WhatsApp message id
  timestamp: string;
  text: string; // normalized message body (trimmed) — empty for a plain image with no caption
  image?: { mediaId: string; mimeType: string };
}

/**
 * Meta sends a fairly deeply nested payload. This pulls out the messages we
 * care about (text, button/list replies, and images) and ignores delivery/
 * read status callbacks, which arrive on the same webhook.
 */
export function parseIncomingWebhook(payload: any): IncomingWhatsAppMessage[] {
  const messages: IncomingWhatsAppMessage[] = [];

  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    const changes = entry?.changes ?? [];
    for (const change of changes) {
      const value = change?.value;
      const rawMessages = value?.messages;
      if (!rawMessages) continue; // e.g. this change is a status callback

      for (const msg of rawMessages) {
        let text = "";
        let image: IncomingWhatsAppMessage["image"];

        if (msg.type === "text") {
          text = msg.text?.body ?? "";
        } else if (msg.type === "interactive") {
          // Tapping a reply button or a list row sends back its `id`, not
          // its display `title` — every button/list we send sets `id` to
          // the exact string a typed reply would produce (e.g. "book",
          // "yes", "3 complete"), so the rest of the bot's parsing logic
          // doesn't need to know whether the user tapped or typed.
          const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
          text = reply?.id ?? reply?.title ?? "";
        } else if (msg.type === "button") {
          text = msg.button?.text ?? "";
        } else if (msg.type === "image") {
          // A caption on the photo becomes the message text (e.g. doctor
          // sends a prescription photo with the medicine names typed as the
          // caption) — falls back to empty if sent with no caption.
          text = msg.image?.caption ?? "";
          if (msg.image?.id) {
            image = { mediaId: msg.image.id, mimeType: msg.image.mime_type || "image/jpeg" };
          }
        }

        messages.push({
          from: String(msg.from || "").replace(/\D/g, ""),
          id: msg.id,
          timestamp: msg.timestamp,
          text: text.trim(),
          image,
        });
      }
    }
  }

  return messages;
}
