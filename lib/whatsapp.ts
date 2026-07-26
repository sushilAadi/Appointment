// Thin wrapper around Meta's WhatsApp Cloud API.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v25.0";

function apiUrl(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  }
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

async function callGraphApi(body: Record<string, unknown>) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    throw new Error("WHATSAPP_TOKEN is not set");
  }

  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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

// ---------------------------------------------------------------------------
// Incoming webhook payload parsing
// ---------------------------------------------------------------------------

export interface IncomingWhatsAppMessage {
  from: string; // sender phone number, digits only
  id: string; // WhatsApp message id
  timestamp: string;
  text: string; // normalized message body (trimmed)
}

/**
 * Meta sends a fairly deeply nested payload. This pulls out the plain-text
 * messages we care about and ignores delivery/read status callbacks, which
 * arrive on the same webhook.
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
        if (msg.type === "text") {
          text = msg.text?.body ?? "";
        } else if (msg.type === "interactive") {
          text =
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title ??
            "";
        } else if (msg.type === "button") {
          text = msg.button?.text ?? "";
        }

        messages.push({
          from: String(msg.from || "").replace(/\D/g, ""),
          id: msg.id,
          timestamp: msg.timestamp,
          text: text.trim(),
        });
      }
    }
  }

  return messages;
}
