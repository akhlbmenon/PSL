import type { Config, Context } from "@netlify/functions";
import { getDeployStore, getStore } from "@netlify/blobs";

const KEY = "arena-state";

const emptyState = () => ({
  version: 1,
  settings: {
    appName: "PSL Arena",
    auctionTimerSeconds: 30,
    autoAuction: false,
    autoNextDelaySeconds: 10,
    meetingsPerPair: 1,
    points: { win: 3, draw: 1, loss: 0 }
  },
  auction: {
    active: false,
    currentPlayerId: null,
    endsAt: null,
    highestBid: null,
    queue: [],
    readyByTeam: {}
  },
  teams: [],
  players: [],
  bids: [],
  chat: [],
  tournaments: [],
  fixtures: [],
  knockout: [],
  updatedAt: new Date().toISOString()
});

function store() {
  const isProd = Netlify.context?.deploy?.context === "production";
  return isProd
    ? getStore("psl-arena", { consistency: "strong" })
    : getDeployStore("psl-arena");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export default async (req: Request, _context: Context) => {
  const s = store();

  if (req.method === "GET") {
    const data = await s.get(KEY, { type: "json" });
    return json(data ?? emptyState());
  }

  if (req.method === "PUT") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body !== "object") return json({ error: "State must be an object" }, 400);
    body.updatedAt = new Date().toISOString();
    await s.setJSON(KEY, body);
    return json({ ok: true, updatedAt: body.updatedAt });
  }

  if (req.method === "DELETE") {
    await s.setJSON(KEY, emptyState());
    return json({ ok: true, state: emptyState() });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = { path: "/api/state" };
