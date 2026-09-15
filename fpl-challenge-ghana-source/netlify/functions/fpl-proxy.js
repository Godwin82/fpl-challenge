// Netlify serverless function. Runs on Netlify's servers, not in the
// browser — so calling fantasy.premierleague.com from here has no CORS
// problem at all (CORS is a browser-only restriction). The frontend
// calls this function at /.netlify/functions/fpl-proxy?url=<target>
// instead of hitting FPL directly, or going through a third-party proxy.
export async function handler(event) {
  const target = event.queryStringParameters && event.queryStringParameters.url;

  // Only ever allow this to fetch FPL's own API — never let it become an
  // open proxy for arbitrary URLs.
  if (!target || !target.startsWith("https://fantasy.premierleague.com/api/")) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing or disallowed url parameter" }),
    };
  }

  try {
    const res = await fetch(target);
    const text = await res.text();
    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30", // small cache so a burst of leaderboard refreshes doesn't hammer FPL
      },
      body: text,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Could not reach the FPL API" }),
    };
  }
}
