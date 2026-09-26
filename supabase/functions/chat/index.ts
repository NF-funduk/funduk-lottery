// supabase/functions/chat/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
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

    const userId = String(payload.sub || "");
    if (!userId) return json({ error: "no_user_in_token" }, 401);

    const body = await req.json();
    const { action } = body;
    if (!action) return json({ error: "no_action" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    switch (action) {
      case "list": {
        const limit = Math.min(Number(body.limit) || 100, 200);
        const { data, error } = await supabase.rpc("get_messages", {
          p_limit: limit,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ messages: data });
      }

      case "send": {
        const { text } = body;
        if (!text || typeof text !== "string") {
          return json({ error: "text_required" }, 400);
        }
        const { data, error } = await supabase.rpc("send_message", {
          p_user_id: userId,
          p_text: text,
        });
        if (error) {
          if (error.message.includes("text_empty")) {
            return json({ error: "text_empty" }, 400);
          }
          if (error.message.includes("text_too_long")) {
            return json({ error: "text_too_long" }, 400);
          }
          return json({ error: "db_error", details: error.message }, 500);
        }
        return json({ message: data?.[0] || null });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
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