import { createFileRoute } from "@tanstack/react-router";

/**
 * Square `order.updated` webhook (optional auto-clear).
 * Signature: base64 HMAC-SHA256 over (notificationUrl + rawBody) using the
 * webhook signature key, sent in `x-square-hmacsha256-signature`.
 * Without SQUARE_WEBHOOK_SIGNATURE_KEY configured the endpoint rejects every
 * call and the app stays on manual clear.
 */
async function verifySignature(
  key: string,
  notificationUrl: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(notificationUrl + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export const Route = createFileRoute("/api/public/square-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
        if (!key) {
          return new Response("Webhooks not configured", { status: 503 });
        }
        const signature = request.headers.get("x-square-hmacsha256-signature");
        const rawBody = await request.text();
        const notificationUrl = process.env["SQUARE_WEBHOOK_URL"] ?? request.url;

        if (!signature || !(await verifySignature(key, notificationUrl, rawBody, signature))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let eventType = "unknown";
        let orderId: string | undefined;
        let state: string | undefined;
        try {
          const payload = JSON.parse(rawBody) as {
            type?: string;
            data?: { object?: { order_updated?: { order_id?: string; state?: string } } };
          };
          eventType = payload.type ?? "unknown";
          orderId = payload.data?.object?.order_updated?.order_id;
          state = payload.data?.object?.order_updated?.state;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        // The client polls open orders; logging here is enough for the
        // active-orders view to drop the order on its next refresh.
        console.log(`[square-webhook] ${eventType} order=${orderId ?? "?"} state=${state ?? "?"}`);
        return new Response("ok");
      },
    },
  },
});
