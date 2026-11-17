# Loxo → Zapier forwarder

A small Express + TypeScript service that replaces the Loxo Zap's fetch, match, Paths and POST steps to cut Zapier task usage:

1. Receives the Loxo webhook and replies `200` straight away.
2. Ignores everything except `item_type = candidate` and `action = update`.
3. Fetches the person from the Loxo API (retries up to 3 times).
4. Finds the candidate record for the webhook's `job_id`. If there isn't one, it stops.
5. Picks a route from the candidate's stage. Any stage not in the route map is skipped.
6. Drops repeats of the same `person_id + job_id + stage` seen in the last 10 minutes.
7. POSTs a stage-specific body to that stage's **Zapier Catch Hook** (retries up to 3 times).

| Stage id | Route | Env var | Body fields |
| --- | --- | --- | --- |
| `17003` | AI Sourcing Enabled | `ZAP_URL_AI_SOURCING` | `person` (full person, JSON string), `has_phone`, `vapi_call_name`, `call_phone`, `job_description`, `job_name` |
| `16749` | Applied | `ZAP_URL_APPLIED` | `candidate_id`, `first_name` (full name), `phone`, `email`, `job_id`, `person_id`, `job_name` |
| `17529` | Ready to Submit | `ZAP_URL_READY_TO_SUBMIT` | `candidate_id`, `candidate_name`, `email`, `phone`, `person_id`, `job_id`, `item_id` |

Every value is sent as a string, with `""` for anything missing (`has_phone` is `"true"` or `"false"`). Zapier is only triggered, and only counts tasks, for events that reach step 7.

To change routing, edit `STAGE_ROUTES` in `src/constants.ts`. To add or remove fields, edit the builder for that stage in `src/payloads.ts`.

## Project layout

| File | Purpose |
| --- | --- |
| `src/index.ts` | Startup, config check, graceful shutdown |
| `src/app.ts` | `GET /health`, `POST /webhooks/loxo`, token check |
| `src/processor.ts` | Steps 2–7 with one structured log line per outcome |
| `src/match.ts` | Candidate matching (port of the Zapier code step) |
| `src/constants.ts` | Stage → route map (also acts as the stage filter) |
| `src/router.ts` | Looks up the route for a stage |
| `src/payloads.ts` | One pure body builder per route |
| `src/dedupe.ts` | 10-minute in-memory dedupe |
| `src/loxo.ts`, `src/zapier.ts`, `src/retry.ts` | HTTP calls with timeouts and retries |

## Configuration

All configuration comes from environment variables. The service won't start if a required one is missing.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `LOXO_API_KEY` | yes | — | Loxo API bearer token |
| `LOXO_AGENCY_SLUG` | yes | — | Your agency slug, used in `https://<domain>/api/<slug>/people/<id>`. Webhooks with a different `agency_slug` are skipped (`agency_mismatch`) |
| `ZAP_URL_AI_SOURCING` | yes | — | Catch Hook for stage 17003 |
| `ZAP_URL_APPLIED` | yes | — | Catch Hook for stage 16749 |
| `ZAP_URL_READY_TO_SUBMIT` | yes | — | Catch Hook for stage 17529 |
| `LOXO_DOMAIN` | no | `app.loxo.co` | |
| `WEBHOOK_SECRET` | no | — | If set, callers must add `?token=<value>` |
| `PORT` | no | `8080` | Cloud Run sets this for you |

## Run locally

Requires Node 20 or later.

```bash
npm install
cp .env.example .env      # then fill in LOXO_API_KEY, LOXO_AGENCY_SLUG and the three ZAP_URL_* values
npm run dev               # http://localhost:8080
```

Tip: while testing, set the three `ZAP_URL_*` values to https://webhook.site URLs so you can see each payload without touching the real Zaps.

### Test with curl

```bash
curl http://localhost:8080/health

# Nested Loxo shape (the sample is in test/sample-payload.json)
curl -X POST "http://localhost:8080/webhooks/loxo?token=$WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d @test/sample-payload.json

# Flat shape works too
curl -X POST "http://localhost:8080/webhooks/loxo?token=$WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"agency_slug":"steve-slater","item_id":3130927,"item_type":"candidate","action":"update","job_id":122597,"person_id":4455725}'
```

The response is always `{"received":true}` (or `401` if the token is wrong). The outcome is in the server logs, for example:

```json
{"severity":"INFO","person_id":4455725,"job_id":122597,"candidate_id":"9002","stage":"17003","route":"AI Sourcing Enabled","outcome":"forwarded","message":"Webhook forwarded to Zapier: AI Sourcing Enabled"}
{"severity":"INFO","person_id":4455725,"job_id":122597,"candidate_id":"9002","stage":"16000","outcome":"skipped","reason":"stage_not_routed","message":"Webhook skipped: stage_not_routed"}
{"severity":"INFO","person_id":4455725,"job_id":122597,"outcome":"skipped","reason":"no_matching_candidate","message":"Webhook skipped: no_matching_candidate"}
```

Skip reasons: `invalid_body`, `not_candidate_update`, `missing_fields`, `agency_mismatch`, `no_matching_candidate`, `stage_not_routed`, `duplicate`. Failures are logged with `outcome: "error"` and include the HTTP status and response body.

### Tests

```bash
npm test          # unit tests: matching, routing, payloads, dedupe, retry, HTTP routes
npm run typecheck
```

### Docker

```bash
docker build -t loxo-forwarder .
docker run --rm -p 8080:8080 --env-file .env loxo-forwarder
```

## Deploy to Google Cloud Run

### Why `--no-cpu-throttling` (and not Cloud Tasks)

The service replies `200` before it calls Loxo and Zapier. By default Cloud Run throttles the CPU once the response has gone out, so the follow-up work can stall or never finish. `--no-cpu-throttling` keeps the CPU allocated so that work completes.

Cloud Tasks would be more durable, because a task survives an instance restart. But it means a queue, extra IAM setup and a second endpoint. Each event here is two HTTP calls taking a few seconds, and volume is low, so that setup isn't worth it yet. Both outbound calls are retried. On shutdown the service waits up to 9 seconds for in-progress events to finish.

`--max-instances=1` is recommended because the dedupe store is in memory, so it only catches repeats that land on the same instance. One instance easily handles Loxo webhook volume. If you ever need more than one instance, move dedupe to Firestore or Memorystore, or switch to Cloud Tasks with named tasks.

### 1. One-time setup

```bash
PROJECT_ID=your-project
REGION=europe-west2
SERVICE=loxo-forwarder

gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### 2. Store secrets in Secret Manager

```bash
printf '%s' 'YOUR_LOXO_API_KEY' | gcloud secrets create loxo-api-key --data-file=-
printf '%s' 'https://hooks.zapier.com/hooks/catch/XXX/AAA/' | gcloud secrets create zap-url-ai-sourcing     --data-file=-
printf '%s' 'https://hooks.zapier.com/hooks/catch/XXX/BBB/' | gcloud secrets create zap-url-applied         --data-file=-
printf '%s' 'https://hooks.zapier.com/hooks/catch/XXX/CCC/' | gcloud secrets create zap-url-ready-to-submit --data-file=-
printf '%s' "$(openssl rand -hex 24)" | gcloud secrets create webhook-secret --data-file=-

# Allow the Cloud Run runtime service account to read them
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"   # or your own service account
for s in loxo-api-key zap-url-ai-sourcing zap-url-applied zap-url-ready-to-submit webhook-secret; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

To rotate a secret later, run `gcloud secrets versions add <name> --data-file=-`, then redeploy or deploy a new revision.

### 3. Deploy

```bash
gcloud run deploy $SERVICE \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=80 \
  --timeout=60 \
  --set-secrets=LOXO_API_KEY=loxo-api-key:latest,ZAP_URL_AI_SOURCING=zap-url-ai-sourcing:latest,ZAP_URL_APPLIED=zap-url-applied:latest,ZAP_URL_READY_TO_SUBMIT=zap-url-ready-to-submit:latest,WEBHOOK_SECRET=webhook-secret:latest \
  --set-env-vars=LOXO_DOMAIN=app.loxo.co,LOXO_AGENCY_SLUG=steve-slater
```

`--set-secrets` and `--set-env-vars` replace the full list on each deploy. So if you deployed the earlier single-hook version, this also removes its old `ZAP_URL` and `FORWARD_STAGE_IDS` settings.

`--allow-unauthenticated` is required because Loxo can't send Google identity tokens. The `?token=` check protects the endpoint instead.

`--min-instances=0` keeps costs down, but the first webhook after a quiet period has a cold start of about 1–2 seconds. That's fine because Loxo still gets its `200`. Set it to `1` if you want no cold starts.

Get the URL and check the service is up:

```bash
URL=$(gcloud run services describe $SERVICE --region $REGION --format='value(status.url)')
curl "$URL/health"
```

Logs are in Cloud Logging. Filter with `resource.labels.service_name="loxo-forwarder"` and `jsonPayload.outcome="forwarded"` (or `"skipped"` / `"error"`). Add `jsonPayload.route="Applied"` to see a single route.

### 4. Register the URL in Loxo

The webhook URL is:

```
https://<cloud-run-url>/webhooks/loxo?token=<webhook-secret value>
```

In Loxo, go to **Settings → Integrations / API → Webhooks** (the exact menu name depends on your Loxo plan; Loxo support can enable webhooks if you can't see it). Edit the existing candidate webhook that currently points at the old Zapier hook, or add a new one:

- **URL:** the URL above
- **Item type:** `candidate`
- **Action:** `update`

You can also register it through the API. Check the request body against Loxo's API docs for your account first; this shape hasn't been verified:

```bash
curl -X POST "https://app.loxo.co/api/<agency_slug>/webhooks" \
  -H "Authorization: Bearer $LOXO_API_KEY" -H "Content-Type: application/json" \
  -d '{"webhook":{"item_type":"candidate","action":"update","endpoint_url":"https://<cloud-run-url>/webhooks/loxo?token=<secret>"}}'
```

### 5. Update Zapier

The service replaces the old Zap's fetch, match, Paths and POST steps. Each stage now goes straight to the Zap that the old Path posted to.

1. Make sure each of the three target Zaps starts with **Webhooks by Zapier → Catch Hook**. Put their URLs in the three `zap-url-*` secrets.
2. Send one test event per stage so each Zap picks up its fields (listed in the table at the top). Check the field mappings still line up.
3. Turn off the old Zap with the Paths, and the old Loxo webhook that fed it, so events aren't processed twice.

## Notes and assumptions

- **Loxo `signature`** is not verified because its algorithm isn't documented here. Authentication relies on `?token=`.
- **ID types:** all ids are sent as strings, and `vapi_call_name` is `{"person_id":"…","job_id":"…","candidate_id":"…"}` with string values. This matches the old Zapier Code step, where inputs are always strings.
- **Missing values:** every body field is sent as `""` instead of being omitted, so Zapier field mappings stay stable.
- **Dedupe timing:** dedupe happens after the Loxo fetch, because the stage is only known then. It saves Zapier tasks but not Loxo API calls. If forwarding to Zapier fails, the dedupe key is released so a redelivery can go through.
