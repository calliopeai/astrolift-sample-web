# astrolift-sample-web

The simplest real Astrolift web service: a single **stateless Node.js
deployment** that serves a themed page and a small JSON endpoint. It is
fixture **R1** in the [sample-fixtures catalog](../) for the core-loop
validation campaign, and it owns the **networking** row of the coverage
matrix (public+TLS vs internal).

No dependencies — stdlib `http` only. `node app/server.js` runs it
anywhere Node 20 is present; `docker build` produces the deployable
image with zero `npm install` step.

## Topology

- **Workload kind:** `deployment` (single workload, single container).
- **Language:** Node.js 20.
- **State:** none (stateless; scale freely, no PVC).
- **Bindings:** none (no managed services attached in either variant).
- **Listen port:** `process.env.PORT` or `8080`.
- **Image:** `docker.io/calliopeai/astrolift-sample-web`, tagged
  `main-<sha7>` and `latest`, built + pushed by GitHub Actions.

## Routes

| Route       | Response                                                              |
|-------------|----------------------------------------------------------------------|
| `GET /`         | Small themed HTML landing page.                                  |
| `GET /api/info` | JSON: app, kind, version, hostname, now, uptime.                 |
| `GET /health`   | `200 {"status":"ok",...}` — drives k8s readiness/liveness.       |
| `GET /debug`    | The spec §3.1 diagnostic JSON (see below).                       |

### Debug endpoints (the §3.1 contract)

`GET /health` returns `200` once the process is serving (no external
dependency to be "not ready"). The manifests wire the k8s probe to it
(`healthcheck.kind = "http"`, `value = "/health"`, `port = 8080`).

`GET /debug` returns the diagnostic surface:

```json
{
  "app": "sample-web",
  "version": "<git-sha or 'dev'>",
  "kind": "deployment",
  "hostname": "<pod>",
  "uptime_s": 123,
  "now": "<iso8601>",
  "env_seen": ["PORT", "LOG_LEVEL", "GIT_SHA", "..."],
  "bindings": {},
  "build": { "image": "...", "built_at": "...", "commit": "..." }
}
```

- `version` / `build.commit` come from the `GIT_SHA` build-arg baked at
  image build time (`"dev"` in local runs).
- `env_seen` lists only **non-secret** env keys that are present — values
  are never echoed.
- `bindings` is `{}` — this fixture attaches no managed services. (There
  is therefore no `/selftest` route; that belongs to managed-service
  consumers like `sample-api`.)

A structured JSON **startup banner** is logged at boot (app, version,
kind, port, hostname, bindings, node version) so logs are immediately
useful.

## Variants → matrix cell

Both variants are authored against the grounded manifest schema
(spec 42 §4) and parse under the real backend parser.

| Manifest                | `is_public` | Exposure                              | Matrix cell                          |
|-------------------------|-------------|---------------------------------------|--------------------------------------|
| `manifests/public.toml`   | `true`    | Public hostname **+ TLS** via ingress driver; 2 replicas. | networking → **public/TLS** |
| `manifests/internal.toml` | `false`   | Cluster-internal Service only; 1 replica.                 | networking → **internal**   |

TLS and the public hostname are produced by the platform's **ingress
driver** from `is_public = true`; the manifest schema has no ingress or
TLS keys, so `is_public` is the entire public-vs-internal contract.

## Build & publish

`.github/workflows/build.yml` builds on push to `main` (and
`workflow_dispatch`) and pushes to Docker Hub via `docker/login-action@v3`
using the org-level `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets.
Tags: `main-<sha7>` (deterministic, what deploys pin to) and `latest`.
The `GIT_SHA` build-arg is baked into the image so `/debug` reports the
built commit.

## Run locally

```sh
node app/server.js
# or
PORT=3000 GIT_SHA=$(git rev-parse --short HEAD) npm start

curl localhost:8080/health
curl localhost:8080/debug
curl localhost:8080/api/info
```

```sh
docker build -t astrolift-sample-web .
docker run --rm -p 8080:8080 astrolift-sample-web
```
