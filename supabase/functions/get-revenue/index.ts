// ============================================================
// GET-REVENUE EDGE FUNCTION  (v2)
// - Klaviyo: metric-aggregates on "Placed Order", grouped by
//   $attributed_channel  ->  total + email split
// - Omnisend: NEW Statistics API (2026-03-15) ->  totalRevenue,
//   totalOrders + email-attributed revenue/orders
// Deploy:  npx supabase functions deploy get-revenue
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { start, end } = await req.json(); // "2026-07-01", "2026-07-23"

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("DB_URL") || "https://ymkbjaeiphgayivjyfuj.supabase.co";
    const key = Deno.env.get("DB_SERVICE_KEY") || "";

    const supabase = createClient(url, key);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const urlObj = new URL(req.url);
    const requestedClientId = urlObj.searchParams.get("client_id");
    let clientId = userData.user.id;

    if (requestedClientId && requestedClientId !== userData.user.id) {
      const { data: prof } = await supabase
        .from("profiles").select("role").eq("id", userData.user.id).single();
      if (prof?.role !== "admin") return json({ error: "Forbidden" }, 403);
      clientId = requestedClientId;
    }

    // Check cache: if data exists and is less than 1 hour old, return it
    const { data: cached } = await supabase
      .from("revenue_cache")
      .select("cached_response, created_at")
      .eq("client_id", clientId)
      .eq("start_date", start)
      .eq("end_date", end)
      .single();
    
    if (cached) {
      const ageMinutes = (Date.now() - new Date(cached.created_at).getTime()) / 60000;
      if (ageMinutes < 60) {
        console.log(`cache hit for ${clientId}: ${ageMinutes.toFixed(1)}min old`);
        return json(cached.cached_response, 200);
      }
    }

    const { data: integration } = await supabase
      .from("client_integrations")
      .select("platform, api_key")
      .eq("client_id", clientId)
      .single();

    if (!integration) {
      return json({ error: "No integration configured for this client" }, 404);
    }

    const result = integration.platform === "klaviyo"
      ? await klaviyoRevenue(integration.api_key, start, end)
      : await omnisendRevenue(integration.api_key, start, end);

    // Save to cache for 1 hour
    try {
      await supabase
        .from("revenue_cache")
        .upsert({ client_id: clientId, start_date: start, end_date: end, cached_response: result })
        .eq("client_id", clientId)
        .eq("start_date", start)
        .eq("end_date", end);
    } catch (cacheErr) {
      console.error("cache save failed:", cacheErr);
      // still return result even if cache fails
    }

    return json(result, 200);
  } catch (e) {
    console.error("get-revenue error:", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Exclusive end: the day AFTER the requested end date, so the
// full end day is included.
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function pickInterval(start: string, end: string): "day" | "week" | "month" {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
  if (days <= 60) return "day";
  if (days <= 364) return "week";
  return "month";
}

function round2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

// ------------------------------------------------------------
// KLAVIYO
// ------------------------------------------------------------
async function klaviyoRevenue(apiKey: string, start: string, end: string) {
  const headers = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
    revision: "2024-10-15",
  };

  // 1) Find the "Placed Order" metric by name (list is paginated)
  let metricId: string | undefined;
  let pageUrl: string | null = "https://a.klaviyo.com/api/metrics/";
  let pages = 0;
  while (pageUrl && !metricId && pages < 10) {
    pages++;
    const metricsRes = await fetch(pageUrl, { headers });
    if (!metricsRes.ok) {
      const t = await metricsRes.text();
      throw new Error(`Klaviyo metrics ${metricsRes.status}: ${t.slice(0, 300)}`);
    }
    const metrics = await metricsRes.json();
    const hit = (metrics?.data ?? []).find(
      (m: any) => String(m?.attributes?.name ?? "").toLowerCase() === "placed order",
    );
    if (hit) metricId = hit.id;
    pageUrl = metrics?.links?.next ?? null;
  }
  if (!metricId) throw new Error("Placed Order metric not found in this Klaviyo account");

  // 1.5) Use the account's own timezone so day buckets match the
  // in-app dashboard (falls back to UTC if the key lacks the scope)
  let accountTz = "UTC";
  try {
    const acctRes = await fetch("https://a.klaviyo.com/api/accounts/", { headers });
    if (acctRes.ok) {
      const acct = await acctRes.json();
      accountTz = acct?.data?.[0]?.attributes?.timezone || "UTC";
    }
  } catch (_) { /* keep UTC */ }

  // 2) Two aggregate queries:
  //    A. ungrouped -> TRUE total store revenue/orders
  //    B. grouped by attributed channel -> email-attributed revenue
  //       (grouping drops unattributed events, so it can't be used for totals)
  const interval = pickInterval(start, end);
  const baseAttrs = {
    metric_id: metricId,
    measurements: ["sum_value", "count"],
    interval,
    page_size: 500,
    filter: [
      `greater-or-equal(datetime,${start}T00:00:00)`,
      `less-than(datetime,${nextDay(end)}T00:00:00)`,
    ],
    timezone: accountTz,
  };

  async function runAggregate(extraAttrs: Record<string, unknown>) {
    const res = await fetch("https://a.klaviyo.com/api/metric-aggregates/", {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: { type: "metric-aggregate", attributes: { ...baseAttrs, ...extraAttrs } },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Klaviyo aggregates ${res.status}: ${t.slice(0, 300)}`);
    }
    return res.json();
  }

  const [totalAgg, channelAgg] = [
    await runAggregate({}),
    await runAggregate({ by: ["$attributed_channel"] }),
  ];

  // --- totals (ungrouped: single series of all Placed Order events)
  const dates: string[] = totalAgg?.data?.attributes?.dates ?? [];
  const totalGroups: any[] = totalAgg?.data?.attributes?.data ?? [];
  let totalRevenue = 0, totalOrders = 0;
  const byDayTotal: number[] = dates.map(() => 0);
  for (const g of totalGroups) {
    const sums: number[] = g.measurements?.sum_value ?? [];
    const counts: number[] = g.measurements?.count ?? [];
    totalRevenue += sums.reduce((a, b) => a + (b || 0), 0);
    totalOrders += counts.reduce((a, b) => a + (b || 0), 0);
    sums.forEach((v, i) => (byDayTotal[i] += v || 0));
  }

  // --- email-attributed daily series for the chart (event-date based)
  const chDates: string[] = channelAgg?.data?.attributes?.dates ?? [];
  const chGroups: any[] = channelAgg?.data?.attributes?.data ?? [];
  let aggEmailRevenue = 0, aggEmailOrders = 0;
  const byDayEmailMap: Record<string, number> = {};
  for (const g of chGroups) {
    const channel = String(g.dimensions?.[0] ?? "").toLowerCase().trim();
    if (!channel) continue; // skip unattributed bucket if present
    // all attributed channels count (email + sms/push)
    const sums: number[] = g.measurements?.sum_value ?? [];
    const counts: number[] = g.measurements?.count ?? [];
    aggEmailRevenue += sums.reduce((a, b) => a + (b || 0), 0);
    aggEmailOrders += counts.reduce((a, b) => a + (b || 0), 0);
    sums.forEach((v, i) => {
      const d = String(chDates[i] ?? "").slice(0, 10);
      if (d) byDayEmailMap[d] = (byDayEmailMap[d] || 0) + (v || 0);
    });
  }

  // --- headline email number from the VALUES REPORTS, which use the
  // same send-date attribution as the in-app dashboard. Falls back to
  // the aggregate numbers if the key lacks report scopes.
  let emailRevenue = aggEmailRevenue;
  let emailOrders = aggEmailOrders;
  try {
    const timeframe = {
      start: `${start}T00:00:00`,
      end: `${nextDay(end)}T00:00:00`,
    };
    async function valuesReport(kind: "campaign" | "flow") {
      const res = await fetch(`https://a.klaviyo.com/api/${kind}-values-reports/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: `${kind}-values-report`,
            attributes: {
              timeframe,
              conversion_metric_id: metricId,
              statistics: ["conversion_value", "conversions"],
              // no channel filter -> attributed across Email + SMS,
              // matching the Klaviyo dashboard headline number
            },
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Klaviyo ${kind} values report ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      let value = 0, orders = 0;
      for (const row of data?.data?.attributes?.results ?? []) {
        value += row?.statistics?.conversion_value || 0;
        orders += row?.statistics?.conversions || 0;
      }
      return { value, orders };
    }
    const [camp, flow] = [await valuesReport("campaign"), await valuesReport("flow")];
    emailRevenue = camp.value + flow.value;
    emailOrders = camp.orders + flow.orders;
  } catch (e) {
    // Reports unavailable (scope/rate limit) -> keep aggregate-based numbers
    console.error("values report fallback:", e);
  }

  return {
    platform: "klaviyo",
    totalRevenue: round2(totalRevenue),
    totalOrders,
    emailRevenue: round2(emailRevenue),
    emailOrders,
    series: dates.map((d, i) => {
      const day = String(d).slice(0, 10);
      return {
        date: day,
        total: round2(byDayTotal[i]),
        email: round2(byDayEmailMap[day] || 0),
      };
    }),
  };
}

// ------------------------------------------------------------
// OMNISEND — Statistics API (version 2026-03-15)
// One request, two queries: store totals + email-attributed.
// ------------------------------------------------------------
async function omnisendRevenue(apiKey: string, start: string, end: string) {
  const headers = {
    Authorization: `Omnisend-API-Key ${apiKey}`,
    "Omnisend-Version": "2026-03-15",
    "content-type": "application/json",
    accept: "application/json",
  };

  const granularity = pickInterval(start, end); // day<=60d, week<=52w, month
  const dateRange = {
    from: `${start}T00:00:00Z`,
    to: `${nextDay(end)}T00:00:00Z`, // 'to' is exclusive
  };

  const body = {
    queries: [
      {
        alias: "store_totals",
        metrics: [{ name: "totalRevenue" }, { name: "totalOrders" }],
        dimensions: [{ name: "timestamp", granularity }],
        dateRange,
      },
      {
        alias: "email_attributed",
        metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
        dimensions: [{ name: "timestamp", granularity }],
        dateRange,
        // no channel filter -> attributed across Email + SMS + Push
      },
    ],
  };

  const res = await fetch("https://api.omnisend.com/api/analytics/statistics", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Omnisend statistics ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();

  const totalsQ = data?.statistics?.find((s: any) => s.alias === "store_totals");
  const emailQ = data?.statistics?.find((s: any) => s.alias === "email_attributed");

  let totalRevenue = 0, totalOrders = 0, emailRevenue = 0, emailOrders = 0;
  const byDayTotal: Record<string, number> = {};
  const byDayEmail: Record<string, number> = {};

  for (const row of totalsQ?.rows ?? []) {
    const ts = String(row.timestamp).slice(0, 10);
    totalRevenue += row.totalRevenue || 0;
    totalOrders += row.totalOrders || 0;
    byDayTotal[ts] = (byDayTotal[ts] || 0) + (row.totalRevenue || 0);
  }
  for (const row of emailQ?.rows ?? []) {
    const ts = String(row.timestamp).slice(0, 10);
    emailRevenue += row.attributedRevenue || 0;
    emailOrders += row.attributedOrders || 0;
    byDayEmail[ts] = (byDayEmail[ts] || 0) + (row.attributedRevenue || 0);
  }

  const allDates = [...new Set([...Object.keys(byDayTotal), ...Object.keys(byDayEmail)])].sort();

  return {
    platform: "omnisend",
    totalRevenue: round2(totalRevenue),
    totalOrders,
    emailRevenue: round2(emailRevenue),
    emailOrders,
    series: allDates.map(date => ({
      date,
      total: round2(byDayTotal[date] || 0),
      email: round2(byDayEmail[date] || 0),
    })),
  };
}
