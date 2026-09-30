// supabase/functions/profile/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { verify, create, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

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
      case "me": {
        const { data, error } = await supabase.rpc("get_my_profile", {
          p_user_id: userId,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        if (!data || data.length === 0) {
          return json({ error: "user_not_found" }, 404);
        }
        return json({ user: data[0] });
      }

      case "my_lottery_history": {
        const { data, error } = await supabase.rpc("get_my_lottery_history", {
          p_user_id: userId,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ history: data });
      }

      case "change_password": {
        const { old_password, new_password } = body;
        if (!old_password || !new_password) {
          return json({ error: "invalid_params" }, 400);
        }
        if (new_password.length < 6) {
          return json({ error: "password_too_short" }, 400);
        }

        const { data: ok, error: changeError } = await supabase.rpc(
          "change_password",
          {
            p_user_id: userId,
            p_old_password: old_password,
            p_new_password: new_password,
          },
        );

        if (changeError) {
          return json({ error: "db_error", details: changeError.message }, 500);
        }
        if (!ok) return json({ error: "wrong_password" }, 401);

        return json({ ok: true });
      }

      case "refresh_token": {
        const { data: freshUser, error: freshErr } = await supabase
          .rpc("get_my_profile", { p_user_id: userId });

        if (freshErr) {
          return json({ error: "db_error", details: freshErr.message }, 500);
        }
        if (!freshUser || freshUser.length === 0) {
          return json({ error: "user_not_found" }, 404);
        }

        const u = freshUser[0];

        const newToken = await create(
          { alg: "HS256", typ: "JWT" },
          {
            sub: u.id,
            username: u.username,
            status: u.status,
            role: "authenticated",
            exp: getNumericDate(60 * 60 * 24), // 24 часа
          },
          key,
        );

        return json({ token: newToken, user: u });
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