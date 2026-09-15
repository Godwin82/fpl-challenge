import React, { useState, useEffect } from "react";

/* ============================================================
   FPL CHALLENGE GHANA — single file, two experiences.
   Public site (default view) + a hidden admin panel reached only
   by typing "admin" on the page (or adding #admin to a real hosted
   URL) — no link or button anywhere in the normal UI points to it.
   Both share the same Supabase project (see supabase-schema.sql),
   so a code the admin generates works immediately for registration,
   on any device, not just the one that generated it.

   Gameweeks are pulled live from FPL's own schedule (bootstrap-static)
   every time the app loads, instead of being hardcoded — so a
   gameweek that has already been played on the real FPL shows as
   Completed here automatically, the current one shows Open, and
   the rest show Coming soon, without anyone having to update a
   constant every week.
   ============================================================ */

const T = {
  navy: "#0B1E3D", navyDeep: "#071429", green: "#1E8E5A", greenDeep: "#166B45",
  gold: "#C9A227", amber: "#C97A2B", red: "#C9483F", gray: "#8A94A6",
  bg: "#F5F7FA", surface: "#FFFFFF", border: "#E2E6ED",
  text: "#101828", textSoft: "#5B6472", onNavy: "#EAF0FA", onNavySoft: "#93A3C4",
};

const STATUS_STYLE = {
  OPEN: { bg: "#E7F5EE", fg: T.greenDeep }, COMING_SOON: { bg: "#FBEEE0", fg: T.amber },
  CLOSED: { bg: "#EEF0F3", fg: T.gray }, LIVE: { bg: "#FBEAE8", fg: T.red },
  COMPLETED: { bg: "#0B1E3D", fg: T.onNavy },
};
const STATUS_LABEL = { OPEN: "Open", COMING_SOON: "Coming soon", CLOSED: "Closed", LIVE: "Live", COMPLETED: "Completed" };

function Badge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.CLOSED;
  return <span className="badge" style={{ background: s.bg, color: s.fg }}>{STATUS_LABEL[status] || status}</span>;
}

// Used only if the live fetch from FPL fails (offline, proxy down, etc.)
// so the app still shows something sensible instead of a blank page.
const FALLBACK_GAMEWEEKS = [
  { id: 1, number: 1, status: "COMPLETED", fee: 50, prizePool: 500, deadline: "TBD" },
  { id: 2, number: 2, status: "COMPLETED", fee: 50, prizePool: 500, deadline: "TBD" },
  { id: 3, number: 3, status: "COMPLETED", fee: 50, prizePool: 500, deadline: "TBD" },
  { id: 4, number: 4, status: "COMPLETED", fee: 50, prizePool: 500, deadline: "TBD" },
  { id: 5, number: 5, status: "OPEN", fee: 50, prizePool: 500, deadline: "TBD" },
];

const money = (n) => `GHS ${n}`;

const ADMIN_EMAIL = "godwinhomadzi820@gmail.com";
const ADMIN_PASSWORD = "God.theo.12,";

// Supabase project. The anon/publishable key is meant to be exposed in
// client code like this — it's restricted by the Row Level Security
// policies in supabase-schema.sql, not by keeping it secret.
const SUPABASE_URL = "https://mvreiqibibarnzxypqmi.supabase.co";
const SUPABASE_KEY = "sb_publishable_YUG1v64rqRmw7ALXfqOdcw_PSndu1lC";
const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

function mapCode(row) {
  return {
    id: row.id,
    code: row.code,
    gwId: row.gw_id,
    status: row.status,
    usedBy: row.used_by_name ? { name: row.used_by_name, teamId: row.used_by_team_id, phone: row.used_by_phone } : null,
    createdAt: row.created_at ? new Date(row.created_at).toLocaleString() : "",
  };
}
function mapRegistration(row) {
  return { id: row.id, gwId: row.gw_id, name: row.name, teamId: row.team_id, phone: row.phone, points: row.points, code: row.code };
}

async function loadCodes() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/codes?select=*&order=created_at.asc`, { headers: SB_HEADERS });
    if (!res.ok) throw new Error("codes fetch failed");
    return (await res.json()).map(mapCode);
  } catch (e) { return []; }
}
async function addCode(code, gwId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/codes`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify([{ code, gw_id: gwId, status: "UNUSED" }]),
  });
  if (!res.ok) throw new Error("code insert failed");
  const rows = await res.json();
  return mapCode(rows[0]);
}
async function markCodeUsed(id, usedBy) {
  // Conditional update: only succeeds if the code is still UNUSED at the
  // moment of writing, closing the gap where two people submit the same
  // code within milliseconds of each other.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/codes?id=eq.${id}&status=eq.UNUSED`, {
    method: "PATCH",
    headers: { ...SB_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify({
      status: "USED",
      used_by_name: usedBy.name,
      used_by_team_id: usedBy.teamId,
      used_by_phone: usedBy.phone,
      used_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error("code update failed");
  const rows = await res.json();
  if (rows.length === 0) throw new Error("ALREADY_USED");
  return mapCode(rows[0]);
}

async function loadRegistrations() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=*&order=points.desc`, { headers: SB_HEADERS });
    if (!res.ok) throw new Error("registrations fetch failed");
    return (await res.json()).map(mapRegistration);
  } catch (e) { return []; }
}
async function addRegistration(reg) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/registrations`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify([{ gw_id: reg.gwId, name: reg.name, team_id: reg.teamId, phone: reg.phone, points: 0, code: reg.code }]),
  });
  if (!res.ok) throw new Error("registration insert failed");
  const rows = await res.json();
  return mapRegistration(rows[0]);
}
async function updateRegistrationPoints(id, points) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${id}`, {
      method: "PATCH",
      headers: SB_HEADERS,
      body: JSON.stringify({ points }),
    });
  } catch (e) {}
}

function randomCode(gwNumber) {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `GW${gwNumber}-${digits}`;
}

// The official FPL API doesn't allow direct browser calls (no CORS
// headers), so everything below goes through a public CORS-proxy that
// just relays the request server-side. No single free proxy is fully
// reliable (rate limits, size limits, outages), so this tries a few
// in order and uses whichever answers first. For anything serious,
// replace this with your own small backend/serverless function that
// calls FPL directly instead of depending on third parties at all.
// Our own serverless function (see netlify/functions/fpl-proxy.js) does
// this properly — it calls FPL server-side, so there's no CORS issue at
// all, no third party in the middle, and no size/rate limits. It only
// exists once this is deployed via Netlify's Git-based build (drag-and-drop
// deploys don't include functions), so the public proxies below stay as a
// backup for previews or if the function isn't available yet.
function ownProxyUrl(target) {
  return `/.netlify/functions/fpl-proxy?url=${encodeURIComponent(target)}`;
}

const CORS_PROXIES = [
  ownProxyUrl,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchViaProxies(target) {
  for (const build of CORS_PROXIES) {
    try {
      const res = await fetch(build(target));
      if (!res.ok) continue;
      const data = await res.json();
      if (data) return data;
    } catch (e) { /* try the next proxy */ }
  }
  return null;
}

async function fetchLivePoints(teamId, eventNumber) {
  const data = await fetchViaProxies(`https://fantasy.premierleague.com/api/entry/${teamId}/event/${eventNumber}/picks/`);
  if (!data || !data.entry_history) return { points: null, live: false };
  return { points: data.entry_history.points, live: true };
}

function formatDeadline(iso) {
  if (!iso) return "TBD";
  try {
    return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return "TBD"; }
}

/**
 * Pulls the real 38-gameweek FPL schedule and maps it onto our own
 * gameweek shape. A gameweek already played on FPL ("finished": true)
 * becomes COMPLETED here — closed to new registration, but still
 * viewable. The one FPL currently has open ("is_current": true)
 * becomes OPEN — the only one people can register for right now.
 * Everything after that is COMING_SOON. This is what makes the whole
 * site move along with the real season automatically.
 */
async function fetchFPLGameweeks() {
  const data = await fetchViaProxies("https://fantasy.premierleague.com/api/bootstrap-static/");
  if (!data || !data.events) return null;
  return data.events.map((e) => ({
    id: e.id,
    number: e.id,
    status: e.finished ? "COMPLETED" : e.is_current ? "OPEN" : "COMING_SOON",
    fee: 50,
    prizePool: 500,
    deadline: formatDeadline(e.deadline_time),
  }));
}

/* ---------------- shared bits ---------------- */

function Container({ children, style }) { return <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px", ...style }}>{children}</div>; }
function PrimaryButton({ children, onClick, full, style, disabled }) {
  return <button className="btn-primary" onClick={onClick} disabled={disabled} style={{ width: full ? "100%" : undefined, ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}), ...style }}>{children}</button>;
}
function GhostButton({ children, onClick, full, style }) { return <button className="btn-ghost" onClick={onClick} style={{ width: full ? "100%" : undefined, ...style }}>{children}</button>; }
function PageHead({ title, sub }) { return <div style={{ marginBottom: 22 }}><h1 className="h1">{title}</h1>{sub && <p className="sub">{sub}</p>}</div>; }
function StatPill({ label, value, accent }) {
  return <div className="stat-pill"><div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div><div className="stat-label">{label}</div></div>;
}
function LoadingBlock({ label }) {
  return <Container style={{ padding: "48px 0", textAlign: "center" }}><p className="sub">{label || "Loading…"}</p></Container>;
}

/* ================= PUBLIC SITE ================= */

function Header({ setPage, page }) {
  const links = [["home", "Home"], ["gameweeks", "Gameweeks"], ["leaderboard", "Leaderboard"]];
  return (
    <header className="site-header">
      <Container style={{ maxWidth: 1040, display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <div className="logo" onClick={() => setPage("home")}>FPL <span style={{ color: T.gold }}>Challenge</span> Ghana</div>
        <nav className="desktop-nav">
          {links.map(([id, label]) => <button key={id} className={"nav-link" + (page === id ? " active" : "")} onClick={() => setPage(id)}>{label}</button>)}
        </nav>
        <button className="btn-primary desktop-nav" onClick={() => setPage("gameweeks")}>View gameweeks</button>
      </Container>
    </header>
  );
}
function MobileTabBar({ setPage, page }) {
  const tabs = [["home", "Home", "⌂"], ["gameweeks", "Gameweeks", "⚽"], ["leaderboard", "Leaderboard", "📊"]];
  return (
    <nav className="mobile-tabbar">
      {tabs.map(([id, label, icon]) => (
        <button key={id} className={"tab" + (page === id ? " active" : "")} onClick={() => setPage(id)}>
          <span aria-hidden style={{ fontSize: 18 }}>{icon}</span><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <Container style={{ maxWidth: 1040 }}>
        <div className="logo" style={{ color: T.onNavy, marginBottom: 12 }}>FPL <span style={{ color: T.gold }}>Challenge</span> Ghana</div>
        <p style={{ color: T.onNavySoft, fontSize: 13, lineHeight: 1.6, maxWidth: 560 }}>
          FPL Challenge Ghana is an independent fantasy football competition platform and is not
          affiliated with, endorsed by, or sponsored by the Premier League or Fantasy Premier League
          unless explicitly stated otherwise. Entry payments are handled manually outside this site.
        </p>
      </Container>
    </footer>
  );
}

function HomePage({ setPage, openGw }) {
  return (
    <>
      <section className="hero">
        <Container>
          <div style={{ color: T.gold, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
            {openGw ? `Gameweek ${openGw.number} is open now` : "Check gameweeks for what's open"}
          </div>
          <h1 className="hero-h1">Your FPL team.<br />Your chance to win.</h1>
          <p className="hero-sub">Pay the entry fee, register with the access code we send you, and track your points live.</p>
          <PrimaryButton style={{ marginTop: 24 }} onClick={() => setPage("gameweeks")}>View gameweeks</PrimaryButton>
        </Container>
      </section>
      <section style={{ padding: "40px 0 56px" }}>
        <Container>
          <h2 className="h2">How it works</h2>
          <div className="steps-flow">
            {[
              ["1", "Pay the entry fee", "Send your gameweek entry fee to us directly (MoMo / contact us) — payment isn't handled on this site."],
              ["2", "Get your access code", "Once we confirm your payment, we send you the link and a one-time access code for that gameweek."],
              ["3", "Register your team", "Enter your access code, name, FPL team ID and phone number. The code only works once."],
              ["4", "Track the live leaderboard", "You're added instantly — watch your rank update against everyone else in the gameweek."],
            ].map(([n, t, d], i, arr) => (
              <React.Fragment key={n}>
                <div className="step-card">
                  <div className="step-num">{n}</div>
                  <div><div className="step-title">{t}</div><div className="step-body">{d}</div></div>
                </div>
                {i < arr.length - 1 && <div className="step-arrow">↓</div>}
              </React.Fragment>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}

function GameweekCard({ gw, registeredCount, onRegister, onView }) {
  return (
    <div className="card gw-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="gw-title">Gameweek {gw.number}</div>
        <Badge status={gw.status} />
      </div>
      {gw.status !== "COMING_SOON" ? (
        <div className="gw-stats">
          <div><div className="gw-stat-label">Entry fee</div><div className="gw-stat-value">{money(gw.fee)}</div></div>
          <div><div className="gw-stat-label">Prize pool</div><div className="gw-stat-value" style={{ color: T.gold }}>{money(gw.prizePool)}</div></div>
          <div><div className="gw-stat-label">Registered</div><div className="gw-stat-value">{registeredCount}</div></div>
        </div>
      ) : (
        <p className="sub" style={{ margin: "10px 0 0" }}>Opens once the previous gameweek finishes on FPL.</p>
      )}
      {gw.status === "OPEN" && <PrimaryButton full style={{ marginTop: 16 }} onClick={() => onRegister(gw)}>I've paid — register</PrimaryButton>}
      {(gw.status === "LIVE" || gw.status === "COMPLETED" || gw.status === "CLOSED") && (
        <GhostButton full style={{ marginTop: 16 }} onClick={() => onView(gw)}>View leaderboard</GhostButton>
      )}
    </div>
  );
}

function GameweeksPage({ gameweeks, registrations, setPage, selectGw }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const countFor = (id) => registrations.filter((r) => r.gwId === id).length;
  const completed = gameweeks.filter((g) => g.status === "COMPLETED");
  const upcoming = gameweeks.filter((g) => g.status !== "COMPLETED");

  return (
    <Container style={{ padding: "32px 0 40px" }}>
      <PageHead title="Available gameweeks" sub="Paid already? Use the access code we sent you to register your team." />
      <div className="gw-grid">
        {upcoming.map((gw) => (
          <GameweekCard key={gw.id} gw={gw} registeredCount={countFor(gw.id)}
            onRegister={(g) => { selectGw(g); setPage("register"); }}
            onView={(g) => { selectGw(g); setPage("leaderboard"); }} />
        ))}
      </div>
      {completed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <GhostButton onClick={() => setShowCompleted((v) => !v)}>
            {showCompleted ? "Hide" : "Show"} {completed.length} completed gameweek{completed.length === 1 ? "" : "s"}
          </GhostButton>
          {showCompleted && (
            <div className="gw-grid" style={{ marginTop: 16 }}>
              {completed.map((gw) => (
                <GameweekCard key={gw.id} gw={gw} registeredCount={countFor(gw.id)}
                  onRegister={(g) => { selectGw(g); setPage("register"); }}
                  onView={(g) => { selectGw(g); setPage("leaderboard"); }} />
              ))}
            </div>
          )}
        </div>
      )}
    </Container>
  );
}

function RegisterPage({ gw, setPage, registrations, setRegistrations }) {
  const [form, setForm] = useState({ code: "", name: "", teamId: "", phone: "" });
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const update = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); if (k === "code") setError(""); };
  const canSubmit = form.code && form.name && form.teamId && form.phone && !checking;
  if (!gw) return null;

  const submit = async () => {
    setChecking(true);
    setError("");
    const codes = await loadCodes();
    const entered = form.code.trim().toUpperCase();
    const match = codes.find((c) => c.code.toUpperCase() === entered && c.gwId === gw.id);

    if (!match) {
      setError("That code isn't valid for this gameweek. Double-check what we sent you, or contact us if you've paid but have no code yet.");
      setChecking(false);
      return;
    }
    if (match.status === "USED") {
      setError("This code has already been used to register. Each code only works once — contact us if you think this is a mistake.");
      setChecking(false);
      return;
    }

    try {
      await markCodeUsed(match.id, { name: form.name, teamId: form.teamId, phone: form.phone });
    } catch (e) {
      setError("This code was just used — someone else may have registered with it moments ago. Contact us if that seems wrong.");
      setChecking(false);
      return;
    }

    const newReg = await addRegistration({ gwId: gw.id, name: form.name, teamId: form.teamId, phone: form.phone, code: match.code });
    setRegistrations([...registrations, newReg]);

    setChecking(false);
    setPage("registered");
  };

  return (
    <Container style={{ padding: "32px 0 48px" }}>
      <button className="back-link" onClick={() => setPage("gameweeks")}>← Back</button>
      <PageHead title={`Register for gameweek ${gw.number}`} sub="You'll need the one-time access code we sent after confirming your payment." />
      <div className="form-field">
        <label>Access code</label>
        <input placeholder="e.g. GW5-4821" value={form.code} onChange={update("code")} />
        {error && <div className="field-error">{error}</div>}
      </div>
      <div className="form-field"><label>Full name</label><input placeholder="Enter your full name" value={form.name} onChange={update("name")} /></div>
      <div className="form-field"><label>FPL team ID</label><input placeholder="e.g. 4471203" value={form.teamId} onChange={update("teamId")} /></div>
      <div className="form-field"><label>Phone number</label><input placeholder="Enter your phone number" value={form.phone} onChange={update("phone")} /></div>
      <PrimaryButton full disabled={!canSubmit} onClick={submit}>{checking ? "Checking…" : "Register"}</PrimaryButton>
      <p style={{ fontSize: 12, color: T.textSoft, marginTop: 12, textAlign: "center" }}>
        Haven't paid yet? <button className="inline-link" onClick={() => alert("Demo: this would show your MoMo / contact details to pay.")}>See how to pay</button>
      </p>
    </Container>
  );
}

function RegisteredPage({ gw, setPage }) {
  return (
    <Container style={{ padding: "48px 0 56px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
      <h1 className="h1">You're in!</h1>
      <p className="sub">You've been added to the Gameweek {gw?.number} leaderboard.</p>
      <PrimaryButton full style={{ marginTop: 20 }} onClick={() => setPage("leaderboard")}>View leaderboard</PrimaryButton>
      <GhostButton full style={{ marginTop: 10 }} onClick={() => setPage("gameweeks")}>Back to gameweeks</GhostButton>
    </Container>
  );
}

function LeaderboardPage({ gameweeks, registrations, setRegistrations, activeGwId, setActiveGwId }) {
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [lastSync, setLastSync] = useState(null);

  const gw = gameweeks.find((g) => g.id === activeGwId) || gameweeks[0];
  const rows = registrations.filter((r) => r.gwId === gw.id).slice().sort((a, b) => b.points - a.points);
  const openGw = gameweeks.find((g) => g.status === "OPEN");

  const refresh = async () => {
    setSyncing(true);
    setSyncNote("");

    if (!openGw || gw.id !== openGw.id) {
      // Not the live gameweek — nothing to sync, points here are final/frozen.
      setSyncNote(gw.status === "COMPLETED" ? "This gameweek is finished — points are final." : "This gameweek isn't live yet.");
      setSyncing(false);
      return;
    }

    let failures = 0;
    const updated = await Promise.all(rows.map(async (r) => {
      const result = await fetchLivePoints(r.teamId, openGw.number);
      if (!result.live) { failures += 1; return r; }
      await updateRegistrationPoints(r.id, result.points);
      return { ...r, points: result.points };
    }));
    const merged = registrations.map((r) => updated.find((u) => u.id === r.id) || r);
    setRegistrations(merged);

    if (rows.length === 0) setSyncNote("No one registered for this gameweek yet.");
    else if (failures === rows.length) setSyncNote("Couldn't reach live FPL data right now — points shown are from the last successful sync. Try again shortly.");
    else if (failures > 0) setSyncNote(`Synced, but ${failures} team${failures === 1 ? "" : "s"} couldn't be reached — showing their last known points.`);

    setLastSync(new Date().toLocaleTimeString());
    setSyncing(false);
  };

  return (
    <Container style={{ padding: "32px 0 48px" }}>
      <PageHead title="Leaderboard" />
      <select className="select" value={gw.id} onChange={(e) => setActiveGwId(Number(e.target.value))}>
        {gameweeks.filter((g) => g.status !== "COMING_SOON").map((g) => <option key={g.id} value={g.id}>Gameweek {g.number}</option>)}
      </select>
      <div className="sync-row">
        <div>
          {lastSync ? <span className="sub" style={{ margin: 0 }}>Last synced {lastSync}</span> : <span className="sub" style={{ margin: 0 }}>Not yet synced</span>}
          {syncNote && <div className="sync-note">{syncNote}</div>}
        </div>
        <GhostButton onClick={refresh} style={{ padding: "8px 14px", fontSize: 13 }}>{syncing ? "Syncing…" : "Refresh live points"}</GhostButton>
      </div>
      <div style={{ marginTop: 14 }}>
        {rows.map((r, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          const accent = i === 0 ? T.gold : i === 1 ? "#9AA5B4" : i === 2 ? "#B77A45" : T.border;
          return (
            <div key={r.id} className="podium-row" style={{ borderLeftColor: accent }}>
              <div className="podium-place" style={{ color: medal ? accent : T.textSoft }}>{medal || `#${i + 1}`}</div>
              <div className="podium-mid"><div className="podium-name">{r.name}</div><div className="podium-team">FPL ID {r.teamId}</div></div>
              <div className="podium-right"><div className="podium-points" style={{ fontWeight: 700, color: T.text }}>{r.points} pts</div></div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="sub">No one has registered for this gameweek yet.</p>}
      </div>
    </Container>
  );
}

function PublicApp() {
  const [page, setPage] = useState("home");
  const [registrations, setRegistrations] = useState([]);
  const [gameweeks, setGameweeks] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [gw, setGw] = useState(null);
  const [activeGwId, setActiveGwId] = useState(null);

  useEffect(() => {
    (async () => {
      const [regs, gws] = await Promise.all([loadRegistrations(), fetchFPLGameweeks()]);
      setRegistrations(regs);
      const finalGws = gws || FALLBACK_GAMEWEEKS;
      setUsingFallback(!gws);
      setGameweeks(finalGws);
      const open = finalGws.find((g) => g.status === "OPEN") || finalGws[0];
      setGw(open);
      setActiveGwId(open.id);
    })();
  }, []);

  if (!gameweeks) return <LoadingBlock label="Loading gameweeks from FPL…" />;

  const openGw = gameweeks.find((g) => g.status === "OPEN");
  const pages = {
    home: <HomePage setPage={setPage} openGw={openGw} />,
    gameweeks: <GameweeksPage gameweeks={gameweeks} registrations={registrations} setPage={setPage} selectGw={setGw} />,
    register: <RegisterPage gw={gw} setPage={setPage} registrations={registrations} setRegistrations={setRegistrations} />,
    registered: <RegisteredPage gw={gw} setPage={setPage} />,
    leaderboard: <LeaderboardPage gameweeks={gameweeks} registrations={registrations} setRegistrations={setRegistrations} activeGwId={activeGwId} setActiveGwId={setActiveGwId} />,
  };

  return (
    <>
      <Header setPage={setPage} page={page} />
      {usingFallback && (
        <div className="fallback-banner">Couldn't reach FPL's schedule right now — showing placeholder gameweeks. Try reloading in a bit.</div>
      )}
      {pages[page] || <HomePage setPage={setPage} openGw={openGw} />}
      <div className="mobile-only-spacer" style={{ height: 64 }} />
      <Footer />
      <MobileTabBar setPage={setPage} page={page} />
    </>
  );
}

/* ================= ADMIN (hidden — only via #admin) ================= */

function StatusTag({ used }) {
  return <span className="badge" style={used ? { background: "#EEF0F3", color: T.gray } : { background: "#E7F5EE", color: T.greenDeep }}>{used ? "Used" : "Unused"}</span>;
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) onLogin();
    else setError("Incorrect email or password.");
  };
  return (
    <Container style={{ padding: "60px 0 60px", maxWidth: 380 }}>
      <div className="logo" style={{ marginBottom: 24 }}>FPL <span style={{ color: T.gold }}>Admin</span></div>
      <PageHead title="Admin login" sub="Generate access codes and see who's registered." />
      <div className="form-field">
        <label>Email</label>
        <input placeholder="admin@fplchallengegh.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
      </div>
      <div className="form-field">
        <label>Password</label>
        <input type="password" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
        {error && <div className="field-error">{error}</div>}
      </div>
      <PrimaryButton onClick={submit} style={{ width: "100%" }}>Log in</PrimaryButton>
    </Container>
  );
}

function AdminShell({ children, page, setPage, onLogout, onExit }) {
  const items = [["dashboard", "Dashboard"], ["codes", "Access codes"], ["participants", "Participants"]];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="logo" style={{ color: T.onNavy, marginBottom: 24 }}>FPL <span style={{ color: T.gold }}>Admin</span></div>
        {items.map(([id, label]) => <button key={id} className={"admin-nav-link" + (page === id ? " active" : "")} onClick={() => setPage(id)}>{label}</button>)}
        <button className="admin-nav-link" style={{ marginTop: 24, color: T.onNavySoft }} onClick={onLogout}>Log out</button>
        <button className="admin-nav-link" style={{ color: T.onNavySoft }} onClick={onExit}>← Exit to site</button>
      </aside>
      <main className="admin-main"><Container style={{ padding: "28px 0 60px", maxWidth: 720, margin: 0 }}>{children}</Container></main>
    </div>
  );
}

function AdminDashboardPage({ codes, gameweeks }) {
  const used = codes.filter((c) => c.status === "USED").length;
  const open = gameweeks.filter((g) => g.status === "OPEN").length;
  const completed = gameweeks.filter((g) => g.status === "COMPLETED").length;
  return (
    <div>
      <PageHead title="Dashboard" />
      <div className="info-grid">
        <StatPill label="Codes generated" value={codes.length} />
        <StatPill label="Registered" value={used} accent={T.green} />
        <StatPill label="Open gameweeks" value={open} />
        <StatPill label="Completed gameweeks" value={completed} />
      </div>
    </div>
  );
}

function AdminCodesPage({ codes, setCodes, gameweeks }) {
  const registerable = gameweeks.filter((g) => g.status !== "COMPLETED");
  const [gwId, setGwId] = useState(registerable[0]?.id);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => setCodes(await loadCodes());

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const gwNum = gameweeks.find((g) => g.id === Number(gwId)).number;
      const fresh = await loadCodes();
      let code;
      do { code = randomCode(gwNum); } while (fresh.some((c) => c.code === code));
      const newCode = await addCode(code, Number(gwId));
      setCodes([...fresh, newCode]);
    } catch (e) {
      setError("Couldn't generate a code — check that the Supabase tables exist (run supabase-schema.sql) and that the project URL/key are correct.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHead title="Access codes" sub="Generate a one-time code once you've confirmed someone's payment, then send it to them with the registration link. Each code only works once." />
      <div className="card" style={{ padding: 18, marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="form-field" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <label>Gameweek</label>
          <select className="select" value={gwId} onChange={(e) => setGwId(e.target.value)}>
            {registerable.map((g) => <option key={g.id} value={g.id}>Gameweek {g.number} ({STATUS_LABEL[g.status]})</option>)}
          </select>
        </div>
        <PrimaryButton onClick={generate} disabled={generating}>{generating ? "Generating…" : "Generate code"}</PrimaryButton>
        <GhostButton onClick={refresh}>Refresh</GhostButton>
        {error && <div className="field-error" style={{ width: "100%" }}>{error}</div>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead><tr><th>Code</th><th>Gameweek</th><th>Status</th><th>Registered by</th><th>Created</th></tr></thead>
          <tbody>
            {codes.slice().reverse().map((c) => {
              const gw = gameweeks.find((g) => g.id === c.gwId);
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{c.code}</td>
                  <td>GW {gw?.number}</td>
                  <td><StatusTag used={c.status === "USED"} /></td>
                  <td>{c.usedBy ? `${c.usedBy.name} · ${c.usedBy.phone}` : "—"}</td>
                  <td style={{ fontSize: 12, color: T.textSoft }}>{c.createdAt}</td>
                </tr>
              );
            })}
            {codes.length === 0 && <tr><td colSpan={5} style={{ color: T.textSoft, textAlign: "center", padding: 24 }}>No codes generated yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminParticipantsPage({ codes, gameweeks }) {
  const registered = codes.filter((c) => c.status === "USED");
  return (
    <div>
      <PageHead title="Participants" sub="Everyone who has registered using a generated code." />
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead><tr><th>Name</th><th>FPL team ID</th><th>Phone</th><th>Gameweek</th><th>Code used</th></tr></thead>
          <tbody>
            {registered.map((c) => {
              const gw = gameweeks.find((g) => g.id === c.gwId);
              return <tr key={c.id}><td>{c.usedBy.name}</td><td>{c.usedBy.teamId}</td><td>{c.usedBy.phone}</td><td>GW {gw?.number}</td><td>{c.code}</td></tr>;
            })}
            {registered.length === 0 && <tr><td colSpan={5} style={{ color: T.textSoft, textAlign: "center", padding: 24 }}>No one has registered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminApp({ onExit }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [codes, setCodes] = useState([]);
  const [gameweeks, setGameweeks] = useState(null);

  const refresh = async () => setCodes(await loadCodes());
  useEffect(() => {
    if (!loggedIn) return;
    refresh();
    (async () => setGameweeks((await fetchFPLGameweeks()) || FALLBACK_GAMEWEEKS))();
  }, [loggedIn]);

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;
  if (!gameweeks) return <LoadingBlock label="Loading gameweeks from FPL…" />;

  const pages = {
    dashboard: <AdminDashboardPage codes={codes} gameweeks={gameweeks} />,
    codes: <AdminCodesPage codes={codes} setCodes={setCodes} gameweeks={gameweeks} />,
    participants: <AdminParticipantsPage codes={codes} gameweeks={gameweeks} />,
  };
  return <AdminShell page={page} setPage={setPage} onLogout={() => setLoggedIn(false)} onExit={onExit}>{pages[page]}</AdminShell>;
}

/* ================= ROOT ================= */

export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => typeof window !== "undefined" && window.location.hash === "#admin");

  useEffect(() => {
    const onHash = () => setIsAdmin(window.location.hash === "#admin");
    window.addEventListener("hashchange", onHash);

    // Fallback trigger for previews with no editable address bar: type
    // "admin" anywhere on the page to open the panel.
    let buffer = "";
    const onKey = (e) => {
      buffer = (buffer + e.key).slice(-5).toLowerCase();
      if (buffer === "admin") setIsAdmin(true);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={isAdmin ? "fpl-admin" : "fpl-app"}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .fpl-app, .fpl-admin { font-family: 'Inter', system-ui, sans-serif; color: ${T.text}; background: ${T.bg}; min-height: 100vh; }
        .fpl-app *, .fpl-admin * { box-sizing: border-box; }
        .fpl-app h1, .fpl-app h2, .fpl-admin h1 { font-family: 'Space Grotesk', 'Inter', sans-serif; margin: 0; }
        .h1 { font-size: 26px; font-weight: 700; line-height: 1.25; }
        .h2 { font-size: 19px; font-weight: 700; margin-bottom: 14px; }
        .sub { color: ${T.textSoft}; font-size: 14.5px; line-height: 1.55; margin: 6px 0 0; }
        .logo { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; color: ${T.onNavy}; cursor: pointer; }
        .fpl-admin .logo { color: ${T.text}; }

        .site-header { position: sticky; top: 0; z-index: 20; background: ${T.navy}; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .desktop-nav { display: none; }
        .nav-link { background: none; border: none; color: ${T.onNavySoft}; font-size: 14px; font-weight: 500; cursor: pointer; padding: 8px 12px; }
        .nav-link.active, .nav-link:hover { color: ${T.onNavy}; }

        .btn-primary { background: ${T.green}; color: #fff; border: none; border-radius: 10px; padding: 13px 20px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .btn-primary:hover { background: ${T.greenDeep}; }
        .btn-ghost { background: transparent; border: 1.5px solid ${T.border}; color: ${T.text}; border-radius: 10px; padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }

        .hero { background: linear-gradient(180deg, ${T.navy} 0%, ${T.navyDeep} 100%); padding: 44px 0 40px; }
        .hero-h1 { color: ${T.onNavy}; font-size: 32px; line-height: 1.15; font-weight: 700; letter-spacing: -0.5px; }
        .hero-sub { color: ${T.onNavySoft}; font-size: 15.5px; line-height: 1.6; margin-top: 14px; max-width: 380px; }

        .steps-flow { display: flex; flex-direction: column; }
        .step-card { display: flex; gap: 14px; background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 14px; padding: 16px; align-items: flex-start; }
        .step-num { flex: none; width: 30px; height: 30px; border-radius: 50%; background: ${T.navy}; color: ${T.onNavy}; font-weight: 700; font-family: 'Space Grotesk', sans-serif; display: flex; align-items: center; justify-content: center; font-size: 13px; }
        .step-title { font-weight: 700; font-size: 15px; margin-bottom: 2px; }
        .step-body { font-size: 13.5px; color: ${T.textSoft}; line-height: 1.5; }
        .step-arrow { text-align: center; color: ${T.gray}; padding: 6px 0; font-size: 15px; }

        .card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px; padding: 16px; }
        .gw-grid { display: grid; gap: 16px; }
        .gw-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; }
        .gw-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
        .gw-stat-label { font-size: 12px; color: ${T.textSoft}; margin-bottom: 2px; }
        .gw-stat-value { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; }

        .badge { display: inline-block; padding: 4px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; }
        .back-link { background: none; border: none; color: ${T.textSoft}; font-size: 13.5px; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 14px; }

        .form-field { margin-bottom: 16px; }
        .form-field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: ${T.text}; }
        .form-field input, .select { width: 100%; border: 1.5px solid ${T.border}; border-radius: 10px; padding: 12px 14px; font-size: 14.5px; font-family: inherit; background: #fff; color: ${T.text}; }
        .form-field input:focus, .select:focus { outline: none; border-color: ${T.green}; }
        .field-error { color: ${T.red}; font-size: 12.5px; margin-top: 6px; line-height: 1.4; }
        .inline-link { background: none; border: none; color: ${T.green}; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline; font-family: inherit; }

        .sync-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
        .sync-note { font-size: 11.5px; color: ${T.amber}; margin-top: 3px; max-width: 260px; }

        .fallback-banner { background: #FBEEE0; color: ${T.amber}; font-size: 13px; text-align: center; padding: 10px 16px; }

        .podium-row { display: flex; align-items: center; justify-content: space-between; background: ${T.surface}; border: 1px solid ${T.border}; border-left: 4px solid; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
        .podium-place { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; width: 40px; flex: none; }
        .podium-mid { flex: 1; }
        .podium-name { font-weight: 700; font-size: 14.5px; }
        .podium-team { font-size: 12.5px; color: ${T.textSoft}; }
        .podium-right { text-align: right; }
        .podium-points { font-family: 'Space Grotesk', sans-serif; font-size: 16px; }

        .site-footer { background: ${T.navyDeep}; padding: 32px 0 96px; }

        .mobile-tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: ${T.surface}; border-top: 1px solid ${T.border}; padding: 8px 6px 12px; z-index: 30; }
        .tab { flex: 1; background: none; border: none; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10.5px; color: ${T.textSoft}; cursor: pointer; padding: 4px; font-family: inherit; }
        .tab.active { color: ${T.green}; font-weight: 700; }

        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .stat-pill { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 12px; padding: 14px; }
        .stat-value { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; }
        .stat-label { font-size: 12px; color: ${T.textSoft}; margin-top: 2px; }

        .table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .table th { text-align: left; font-size: 11.5px; color: ${T.textSoft}; font-weight: 600; padding: 10px 12px; border-bottom: 1px solid ${T.border}; white-space: nowrap; }
        .table td { padding: 12px; border-bottom: 1px solid ${T.border}; white-space: nowrap; }
        .table tr:last-child td { border-bottom: none; }

        .admin-shell { display: flex; min-height: 100vh; }
        .admin-sidebar { width: 200px; background: ${T.navy}; padding: 24px 14px; flex: none; display: flex; flex-direction: column; }
        .admin-nav-link { text-align: left; background: none; border: none; color: ${T.onNavySoft}; font-size: 14px; font-weight: 500; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-family: inherit; margin-bottom: 2px; }
        .admin-nav-link.active { background: rgba(255,255,255,0.08); color: ${T.onNavy}; }
        .admin-main { flex: 1; padding: 0 24px; }

        @media (min-width: 720px) {
          .desktop-nav { display: flex; align-items: center; gap: 2px; }
          .mobile-tabbar { display: none; }
          .mobile-only-spacer { display: none; }
          .gw-grid { grid-template-columns: repeat(2, 1fr); }
          .fpl-admin .info-grid { grid-template-columns: repeat(4, 1fr); }
        }
        @media (max-width: 719px) {
          .sync-row { flex-direction: column; align-items: flex-start; }
          .admin-sidebar { width: 76px; padding: 16px 6px; }
          .admin-sidebar .logo { font-size: 12px; text-align: center; }
          .admin-nav-link { font-size: 10.5px; text-align: center; padding: 8px 4px; }
        }
      `}</style>
      {isAdmin ? <AdminApp onExit={() => setIsAdmin(false)} /> : <PublicApp />}
    </div>
  );
}
