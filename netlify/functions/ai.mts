import type { Config, Context } from "@netlify/functions";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function isAdminQuestion(text: string) {
  return /admin|superadmin|password|reset|delete all|access control|approve|reject|environment|api key|database|secret|moderator permission|change budget|override/i.test(text);
}

function fallbackAnswer(text: string) {
  if (isAdminQuestion(text)) return "🔐 That is an admin/organiser matter. Please ask Akhil, Ashi or Revak in the chat.";
  if (/ready/i.test(text)) return "✅ Captains should tap the single Ready / Not Ready button before the next bid. The button is locked while a bid is running.";
  if (/bid|auction/i.test(text)) return "🔨 During a live auction, captains can bid while the timer is active. Late bids do not reset the timer. The highest valid bid wins when time expires.";
  if (/fixture|matchday/i.test(text)) return "📅 Open Tournament → Fixtures to view matchdays. Admins can generate fixtures based on how many times every team should meet and share each matchday as text.";
  if (/table|points/i.test(text)) return "📊 The points table is recalculated from completed fixtures using the configured win/draw/loss points.";
  if (/scorer|goal/i.test(text)) return "⚽ Goal scorers are recorded while updating a match result. The Top Scorers table is then updated automatically.";
  if (/clean sheet/i.test(text)) return "🧤 A clean sheet is credited when a team concedes 0 in a completed match. The leaderboard updates from recorded results.";
  return "🤖 I’m the PSL Arena host. Ask me about bidding, readiness, players, teams, fixtures, matchdays, points, scorers, clean sheets or knockout rounds. For admin-only controls, please ask the organisers.";
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const message = String(body?.message ?? "").trim().slice(0, 1000);
  if (!message) return json({ error: "Message required" }, 400);
  if (isAdminQuestion(message)) return json({ reply: fallbackAnswer(message), source: "policy" });

  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ reply: fallbackAnswer(message), source: "fallback" });

  const model = Netlify.env.get("OPENAI_MODEL") || "gpt-5.6-luna";
  const stateSummary = JSON.stringify(body?.context ?? {}).slice(0, 12000);
  const instructions = `You are PSL Arena AI Host, the main auction host and chat moderator for an eFootball player auction and tournament organiser. Be concise, friendly and energetic. Use fitting emojis. Answer all normal user/captain questions about the auction, teams, players, bidding, readiness, fixtures, standings, scores, scorers, clean sheets and knockout phase. Never reveal or answer admin-only matters such as passwords, secrets, API keys, access-control decisions, destructive actions, private admin configuration or authority overrides. For those, say: "🔐 That is an admin/organiser matter. Please ask Akhil, Ashi or Revak in the chat." Encourage any captain who is not ready to tap Ready before an auction starts. Do not invent live values that are absent from the supplied state.`;

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        input: `${instructions}\n\nCURRENT PSL ARENA STATE:\n${stateSummary}\n\nUSER: ${message}`,
        max_output_tokens: 300
      })
    });
    if (!r.ok) return json({ reply: fallbackAnswer(message), source: "fallback", providerStatus: r.status });
    const data: any = await r.json();
    const reply = data.output_text || data.output?.flatMap((x: any) => x.content || []).map((c: any) => c.text).filter(Boolean).join("\n") || fallbackAnswer(message);
    return json({ reply, source: "ai" });
  } catch {
    return json({ reply: fallbackAnswer(message), source: "fallback" });
  }
};

export const config: Config = { path: "/api/ai" };
