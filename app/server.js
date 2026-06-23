"use strict";

// astrolift-sample-web — the simplest real Astrolift web fixture.
//
// A single stateless Node HTTP service (workload kind=deployment) used
// by the validation campaign (spec 42, repo R1) to exercise the
// public+TLS and internal networking variants. Stdlib `http` only — no
// dependencies, so `node app/server.js` runs anywhere Node 20 is present.
//
// Routes:
//   GET /          themed HTML landing page
//   GET /api/info  small JSON payload
//   GET /health    200 readiness/liveness probe (drives k8s probes)
//   GET /debug     the spec §3.1 diagnostic JSON

const http = require("http");
const os = require("os");

const APP = "sample-web";
const KIND = "deployment";
const VERSION = process.env.GIT_SHA || "dev";
const PORT = Number(process.env.PORT) || 8080;
const STARTED_AT = Date.now();

// Build metadata is baked at image build time via build-args (see
// Dockerfile + .github/workflows/build.yml). Absent in local dev.
const BUILD = {
  image: process.env.IMAGE_REF || "",
  built_at: process.env.BUILT_AT || "",
  commit: process.env.GIT_SHA || "",
};

// Non-secret env keys worth reporting in /debug. We never echo values —
// only which keys are present — so this is safe to expose. This fixture
// has no managed-service bindings (the deployment is bindings: none), so
// the list is just the runtime knobs the platform may inject.
const NON_SECRET_ENV_KEYS = [
  "PORT",
  "LOG_LEVEL",
  "GIT_SHA",
  "IMAGE_REF",
  "BUILT_AT",
  "HOSTNAME",
];

function envSeen() {
  return NON_SECRET_ENV_KEYS.filter((k) => process.env[k] !== undefined);
}

function uptimeSeconds() {
  return Math.floor((Date.now() - STARTED_AT) / 1000);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": "no-store",
  });
  res.end(html);
}

function landingPage() {
  const host = os.hostname();
  // Astrolift-themed (the platform's celestial-navigation motif): a
  // small self-contained page, no external assets, so it renders behind
  // any ingress without a CDN.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>astrolift-sample-web</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      color: #e6edf3;
      background: radial-gradient(1200px 800px at 70% -10%, #1b2a4a 0%, #0a0e1a 60%, #05060d 100%);
    }
    .card {
      max-width: 34rem; padding: 2.5rem 2.75rem; border-radius: 16px;
      background: rgba(20, 27, 45, 0.72);
      border: 1px solid rgba(120, 160, 255, 0.18);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(6px);
    }
    h1 { margin: 0 0 0.35rem; font-size: 1.5rem; letter-spacing: 0.02em; }
    .tag { color: #7aa2ff; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.18em; }
    p { line-height: 1.6; color: #aeb9c9; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; margin: 1.25rem 0 0; font-size: 0.9rem; }
    dt { color: #7aa2ff; }
    dd { margin: 0; color: #d4dbe6; }
    a { color: #9fc1ff; }
    nav { margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.85rem; }
  </style>
</head>
<body>
  <main class="card">
    <div class="tag">Astrolift &middot; sample fixture</div>
    <h1>sample-web is flying</h1>
    <p>A minimal stateless web service — the simplest deployment on the
       Astrolift BYOC runtime. Use it to chart the public+TLS and internal
       networking variants.</p>
    <dl>
      <dt>app</dt><dd>${APP}</dd>
      <dt>kind</dt><dd>${KIND}</dd>
      <dt>version</dt><dd>${VERSION}</dd>
      <dt>host</dt><dd>${host}</dd>
    </dl>
    <nav>
      <a href="/api/info">/api/info</a>
      <a href="/health">/health</a>
      <a href="/debug">/debug</a>
    </nav>
  </main>
</body>
</html>`;
}

function apiInfo() {
  return {
    app: APP,
    kind: KIND,
    version: VERSION,
    message: "Astrolift sample web service — stateless, public+TLS or internal.",
    hostname: os.hostname(),
    now: new Date().toISOString(),
    uptime_s: uptimeSeconds(),
  };
}

function debugInfo() {
  // The spec §3.1 diagnostic surface. `bindings: none` because this
  // fixture attaches no managed services in either variant.
  return {
    app: APP,
    version: VERSION,
    kind: KIND,
    hostname: os.hostname(),
    uptime_s: uptimeSeconds(),
    now: new Date().toISOString(),
    env_seen: envSeen(),
    bindings: {},
    build: BUILD,
  };
}

const server = http.createServer((req, res) => {
  // Normalize: strip query string, ignore trailing slash (except root).
  const rawPath = (req.url || "/").split("?")[0];
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "method_not_allowed", method: req.method });
    return;
  }

  switch (path) {
    case "/":
      sendHtml(res, 200, landingPage());
      return;
    case "/api/info":
      sendJson(res, 200, apiInfo());
      return;
    case "/health":
      // Liveness/readiness. Always 200 once the event loop is serving —
      // this fixture has no external dependency that could be "not ready".
      sendJson(res, 200, { status: "ok", uptime_s: uptimeSeconds() });
      return;
    case "/debug":
      sendJson(res, 200, debugInfo());
      return;
    default:
      sendJson(res, 404, { error: "not_found", path });
      return;
  }
});

server.listen(PORT, () => {
  // Structured startup banner — one JSON line so log scrapers can parse
  // it directly. Mirrors the /debug surface so logs are immediately useful.
  const banner = {
    event: "startup",
    app: APP,
    version: VERSION,
    kind: KIND,
    port: PORT,
    hostname: os.hostname(),
    bindings: [], // no managed-service bindings in this fixture
    node: process.version,
    now: new Date().toISOString(),
  };
  console.log(JSON.stringify(banner));
});

// Graceful shutdown so k8s rolling updates / scale-down don't drop
// in-flight requests and the pod terminates promptly.
function shutdown(signal) {
  console.log(JSON.stringify({ event: "shutdown", signal, app: APP }));
  server.close(() => process.exit(0));
  // Hard cap so a stuck connection can't block termination forever.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { server };
