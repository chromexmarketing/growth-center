// ============================================================
// ADMIN-CREATE-USER EDGE FUNCTION
// Lets the admin create a client account (auth user + profile
// + platform integration) from inside the portal.
// Deploy:  npx supabase functions deploy admin-create-user
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, password, first_name, brand_name, platform, api_key, account_type, client_id, assigned_client_ids } =
      await req.json();

    if (!email || !password) return json({ error: "Email and password are required" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const url = Deno.env.get("DB_URL") || "https://ymkbjaeiphgayivjyfuj.supabase.co";
    const key = Deno.env.get("DB_SERVICE_KEY") || "";
    const supabase = createClient(url, key);

    // 1) caller must be the admin
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const { data: prof } = await supabase
      .from("profiles").select("role").eq("id", userData.user.id).single();
    if (prof?.role !== "admin") return json({ error: "Forbidden" }, 403);

    // 2) create the auth user (email pre-confirmed so they can log in immediately)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) return json({ error: createErr.message }, 400);
    const newId = created.user.id;

    // 3) fill in their profile (row was auto-created by the DB trigger)
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        first_name: first_name || "",
        brand_name: account_type === "client_member" ? "" : (brand_name || ""),
        role: account_type === "staff" ? "staff" : "client",
      })
      .eq("id", newId);
    if (profErr) return json({ error: `User created but profile failed: ${profErr.message}` }, 500);

    if (account_type === "client_member") {
      if (!client_id) return json({error:"Client brand required"},400);
      const {error: memberErr} = await supabase.from("client_memberships").insert({user_id:newId,client_id});
      if (memberErr) return json({error:memberErr.message},500);
      const {error: chatErr} = await supabase.from("chat_members").insert({user_id:newId,client_id,member_role:"client"});
      if (chatErr) return json({error:chatErr.message},500);
    }
    if (account_type === "staff" && assigned_client_ids?.length) {
      const {error: assignmentErr} = await supabase.from("staff_assignments").insert(assigned_client_ids.map((id:string)=>({staff_id:newId,client_id:id})));
      if (assignmentErr) return json({error:assignmentErr.message},500);
    }
    // 4) optional platform integration
    if ((!account_type || account_type === 'client') && platform && api_key) {
      const { error: intErr } = await supabase
        .from("client_integrations")
        .insert({ client_id: newId, platform, api_key });
      if (intErr) {
        return json({
          error: `User created but integration failed: ${intErr.message}`,
        }, 500);
      }
    }

    return json({ ok: true, id: newId }, 200);
  } catch (e) {
    console.error("admin-create-user error:", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
