// supabase/functions/feedback/index.ts

import { verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "no_token" }, 401);

    const secretKey = Deno.env.get("JWT_SECRET");
    if (!secretKey) return json({ error: "server_misconfigured" }, 500);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    let payload: any;
    try {
      payload = await verify(token, key);
    } catch {
      return json({ error: "invalid_token" }, 401);
    }

    const username = String(payload.username || "unknown");
    const status = String(payload.status || "unknown");

    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return json({ error: "text_required" }, 400);
    }

    const trimmed = text.trim();
    if (trimmed.length < 3) return json({ error: "text_too_short" }, 400);
    if (trimmed.length > 2000) return json({ error: "text_too_long" }, 400);

    const webhookUrl = Deno.env.get("DISCORD_FEEDBACK_WEBHOOK");
    if (!webhookUrl) return json({ error: "webhook_not_configured" }, 500);

    const now = new Date();
    const dateStr = now.toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const ADMIN_DISCORD_ID = Deno.env.get("ADMIN_DISCORD_ID") || "867373653959376927";

const pingText = ADMIN_DISCORD_ID ? `<@${ADMIN_DISCORD_ID}>` : "**админ**";

const discordPayload = {
  content: `${pingText} 📬 **${username}** оставил отзыв:`,
  embeds: [
    {
      description: trimmed,
      color: 0x7c5cff,
      footer: { text: `${dateStr} · ${username} · ${status}` },
    },
  ],
};

    const dRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    if (!dRes.ok) {
      const errText = await dRes.text();
      console.error("Discord webhook error:", dRes.status, errText);
      return json({ error: "discord_error", details: errText }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("unexpected error:", e);
    return json({ error: "unexpected", details: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}