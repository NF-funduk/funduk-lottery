// supabase/functions/admin/index.ts

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
    // ============ 1. Проверяем JWT ============
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

    if (payload.status !== "admin") {
      return json({ error: "forbidden" }, 403);
    }

    // ============ 2. Разбираем запрос ============
    const body = await req.json();
    const { action } = body;
    if (!action) return json({ error: "no_action" }, 400);

    // ============ 3. Supabase client (service_role) ============
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ============ 4. Роутинг по action ============
    switch (action) {
      case "list_users": {
        const { data, error } = await supabase.rpc("admin_list_users");
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ users: data });
      }

      case "create_user": {
        const { username, status, balance } = body;
        if (!username) return json({ error: "username_required" }, 400);
        if (!["intern", "helper", "moderator", "admin"].includes(status)) {
          return json({ error: "invalid_status" }, 400);
        }

        const password = generatePassword(16);
        const { data, error } = await supabase.rpc("register_user", {
          p_username: username,
          p_password: password,
          p_status: status,
          p_balance: balance ?? 0,
        });

        if (error) {
          if (error.message.includes("username_taken")) {
            return json({ error: "username_taken" }, 409);
          }
          return json({ error: "db_error", details: error.message }, 500);
        }

        return json({
          user_id: data,
          username,
          password,
          status,
          balance: balance ?? 0,
        });
      }

      case "update_user": {
        const { user_id, username, status } = body;
        if (!user_id || !username || !status) {
          return json({ error: "invalid_params" }, 400);
        }
        const { data, error } = await supabase.rpc("admin_update_user", {
          p_user_id: user_id,
          p_username: username,
          p_status: status,
        });
        if (error) {
          if (error.message.includes("username_taken")) {
            return json({ error: "username_taken" }, 409);
          }
          return json({ error: "db_error", details: error.message }, 500);
        }
        return json({ ok: data });
      }

      case "delete_user": {
        const { user_id } = body;
        if (!user_id) return json({ error: "user_id_required" }, 400);
        // запрет удаления самого себя
        if (user_id === payload.sub) {
          return json({ error: "cannot_delete_self" }, 400);
        }
        const { data, error } = await supabase.rpc("admin_delete_user", {
          p_user_id: user_id,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ ok: data });
      }

      case "grant_balance": {
        const { user_id, amount, reason } = body;
        if (!user_id || typeof amount !== "number") {
          return json({ error: "invalid_params" }, 400);
        }
        const { data, error } = await supabase.rpc("admin_grant_balance", {
          p_user_id: user_id,
          p_amount: amount,
          p_reason: reason ?? "admin_grant",
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ new_balance: data });
      }

      case "grant_free_tickets": {
        const { user_id, lottery_id, count } = body;
        if (!user_id || !lottery_id || typeof count !== "number") {
          return json({ error: "invalid_params" }, 400);
        }
        const { data, error } = await supabase.rpc("admin_grant_free_tickets", {
          p_user_id: user_id,
          p_lottery_id: lottery_id,
          p_count: count,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ inserted: data });
      }

      case "reset_password": {
        const { user_id } = body;
        if (!user_id) return json({ error: "user_id_required" }, 400);
        const password = generatePassword(16);
        const { data, error } = await supabase.rpc("admin_reset_password", {
          p_user_id: user_id,
          p_new_password: password,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        if (!data) return json({ error: "user_not_found" }, 404);
        return json({ password });
      }

            case "user_transactions": {
        const { user_id } = body;
        if (!user_id) return json({ error: "user_id_required" }, 400);

        const { data, error } = await supabase.rpc("admin_get_user_transactions", {
          p_user_id: user_id,
          p_limit: 100,
        });

        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ transactions: data });
      }

            case "list_lotteries_for_admin": {
        const { data, error } = await supabase.rpc("list_active_lotteries");
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ lotteries: data });
      }

      case "cancel_lottery": {
        const { lottery_id } = body;
        if (!lottery_id) return json({ error: "lottery_id_required" }, 400);

        const { data, error } = await supabase.rpc("admin_cancel_lottery", {
          p_lottery_id: lottery_id,
        });

        if (error) {
          const known = ["lottery_not_found", "already_drawn", "already_cancelled"];
          const matched = known.find((e) => error.message.includes(e));
          if (matched) return json({ error: matched }, 400);
          return json({ error: "db_error", details: error.message }, 500);
        }
        return json({ result: data });
      }

      case "delete_lottery": {
        const { lottery_id } = body;
        if (!lottery_id) return json({ error: "lottery_id_required" }, 400);

        const { data, error } = await supabase.rpc("admin_delete_lottery", {
          p_lottery_id: lottery_id,
        });
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ ok: data });
      }

      case "list_all_lotteries": {
        const { data, error } = await supabase.rpc("list_all_lotteries");
        if (error) return json({ error: "db_error", details: error.message }, 500);
        return json({ lotteries: data });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("unexpected error:", e);
    return json({ error: "unexpected", details: String(e) }, 500);
  }
});

// ============================================================
// Утилиты
// ============================================================

function generatePassword(length: number): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}