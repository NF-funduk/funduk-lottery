// supabase/functions/lottery/index.ts

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
    const userStatus = String(payload.status || "");

    const body = await req.json();
    const { action } = body;
    if (!action) return json({ error: "no_action" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    switch (action) {
      case "list": {
        const { data, error } = await supabase.rpc("list_active_lotteries");
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ lotteries: data });
      }

      case "all": {
        const { data, error } = await supabase.rpc("list_all_lotteries");
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ lotteries: data });
      }

      case "details": {
        const { lottery_id } = body;
        if (!lottery_id) return json({ error: "lottery_id_required" }, 400);
        const { data, error } = await supabase.rpc("get_lottery_details", {
          p_lottery_id: lottery_id,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json(data);
      }

      case "tickets": {
        const { lottery_id } = body;
        if (!lottery_id) return json({ error: "lottery_id_required" }, 400);
        const { data, error } = await supabase.rpc("get_lottery_tickets", {
          p_lottery_id: lottery_id,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ tickets: data });
      }

      case "my_free_tickets": {
        const { lottery_id } = body;
        if (!lottery_id) return json({ error: "lottery_id_required" }, 400);
        const { data, error } = await supabase.rpc("get_my_free_tickets", {
          p_user_id: userId,
          p_lottery_id: lottery_id,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ count: data });
      }

      case "buy": {
        const { lottery_id, ticket_numbers, use_free } = body;
        if (
          !lottery_id ||
          !Array.isArray(ticket_numbers) ||
          ticket_numbers.length === 0
        ) {
          return json({ error: "invalid_params" }, 400);
        }
        const { data, error } = await supabase.rpc("buy_tickets", {
          p_user_id: userId,
          p_lottery_id: lottery_id,
          p_ticket_numbers: ticket_numbers,
          p_use_free: use_free ?? 0,
        });
        if (error) {
          const knownErrors = [
            "lottery_not_found",
            "lottery_not_active",
            "deadline_passed",
            "user_not_found",
            "no_tickets_selected",
            "exceeds_user_limit",
            "ticket_already_taken",
            "not_enough_free_tickets",
            "too_many_free",
            "insufficient_balance",
            "ticket_race_condition",
          ];
          const matched = knownErrors.find((e) => error.message.includes(e));
          if (matched) return json({ error: matched }, 400);
          return json({ error: "db_error", details: error.message }, 500);
        }

        const { data: freshRows } = await supabase.rpc("get_my_profile", {
          p_user_id: userId,
        });
        const freshUser = freshRows?.[0] || null;

        return json({ result: data, user: freshUser });
      }

      case "create": {
        if (userStatus !== "admin") {
          return json({ error: "forbidden" }, 403);
        }

        const {
          title,
          description,
          logo_url,
          ticket_price,
          total_tickets,
          max_tickets_per_user,
          deadline,
          prizes,
        } = body;

        if (!title || !total_tickets || !max_tickets_per_user) {
          return json({ error: "invalid_params" }, 400);
        }
        if (!Array.isArray(prizes) || prizes.length === 0) {
          return json({ error: "no_prizes" }, 400);
        }

        const { data, error } = await supabase.rpc("create_lottery", {
          p_title: title,
          p_description: description ?? "",
          p_logo_url: logo_url ?? null,
          p_ticket_price: ticket_price ?? 0,
          p_total_tickets: total_tickets,
          p_max_tickets_per_user: max_tickets_per_user,
          p_deadline: deadline ?? null,
          p_prizes: prizes,
          p_created_by: userId,
        });

        if (error) return json({ error: "db_error", details: error.message }, 500);

        return json({ lottery_id: data });
      }

      case "draw": {
        if (userStatus !== "admin") {
          return json({ error: "forbidden" }, 403);
        }

        const { lottery_id } = body;
        if (!lottery_id) return json({ error: "lottery_id_required" }, 400);

        const { data, error } = await supabase.rpc("draw_lottery", {
          p_lottery_id: lottery_id,
        });

        if (error) {
          const knownErrors = [
            "lottery_not_found",
            "already_drawn",
            "lottery_cancelled",
          ];
          const matched = knownErrors.find((e) => error.message.includes(e));
          if (matched) return json({ error: matched }, 400);
          return json({ error: "db_error", details: error.message }, 500);
        }

        return json({ result: data });
      }

      case "winners": {
        const { lottery_id } = body;
        if (!lottery_id) return json({ error: "lottery_id_required" }, 400);
        const { data, error } = await supabase.rpc("get_lottery_winners", {
          p_lottery_id: lottery_id,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ winners: data });
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