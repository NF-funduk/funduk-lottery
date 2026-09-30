// supabase/functions/login/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

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
    const { username, password } = await req.json();

    if (!username || !password) {
      return json({ error: "missing_credentials" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("verify_password", {
      p_username: username,
      p_password: password,
    });

    if (error) {
      console.error("verify_password error:", error);
      return json({ error: "db_error", details: error.message }, 500);
    }

    if (!data || data.length === 0) {
      return json({ error: "invalid_credentials" }, 401);
    }

    const user = data[0];

    const secretKey = Deno.env.get("JWT_SECRET");
    if (!secretKey) {
      return json({ error: "server_misconfigured" }, 500);
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    const token = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: user.id,
        username: user.username,
        status: user.status,
        role: "authenticated",
        exp: getNumericDate(60 * 60 * 24), // 24 часа
      },
      key,
    );

    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    return json({ token, user });
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