# MicroManus Cloud Run deployment

Last updated: 2026-07-19

## Current status

The MicroManus research-agent service is deployed successfully to Google Cloud Run.

| Setting | Value |
|---|---|
| Google Cloud project | `micromanus-502805` |
| Project number | `788512849748` |
| Cloud Run service | `micromanus-agent` |
| Region | `us-central1` |
| Service URL | `https://micromanus-agent-788512849748.us-central1.run.app` |
| Healthy revision | `micromanus-agent-00003-94j` |
| Runtime service account | `micromanus-runner@micromanus-502805.iam.gserviceaccount.com` |
| Secret | `micromanus-agent-service-token`, version `2` |
| CPU / memory | 1 vCPU / 512 MiB |
| Scaling | 0 minimum, 1 maximum instance |
| Concurrency | 10 requests per instance |
| Request timeout | 600 seconds |
| Checkpoint backend | SQLite on ephemeral storage |

Health verification returned:

```text
status  version  checkpoint_backend  pricing_version
ok      0.1.0    sqlite              2026-07-18.1
```

## What was configured

1. Created and activated a separate Google Cloud CLI configuration named `micromanus`.
2. Selected project `micromanus-502805` without changing the existing InfraDock CLI configuration.
3. Enabled these APIs:
   - Cloud Resource Manager
   - Cloud Run
   - Cloud Build
   - Artifact Registry
   - Secret Manager
4. Confirmed that billing is enabled.
5. Created the `micromanus-agent-service-token` secret.
6. Replaced the insecure first secret version with a cryptographically random 64-character value in version 2.
7. Destroyed secret version 1.
8. Created the dedicated `micromanus-runner` runtime service account.
9. Granted that account `roles/secretmanager.secretAccessor` on only the agent secret.
10. Built the existing `services/agent/Dockerfile` using Cloud Build and stored the image in Artifact Registry.
11. Deployed the image to Cloud Run and allowed public network access. Protected `/v1/*` endpoints still require the internal bearer token.
12. Corrected the runtime artifact path and attached secret version 2 to the healthy revision.

## Problems encountered and resolutions

### PowerShell treated an unquoted project ID as a command

PowerShell string values must be quoted:

```powershell
$projectId = "micromanus-502805"
```

### The `gcloud.ps1` wrapper was blocked

Use `gcloud.cmd` in PowerShell. This avoids changing the machine-wide execution policy.

### Static `RandomNumberGenerator.Fill` was unavailable

The installed PowerShell/.NET runtime does not expose that static method. Token generation used the compatible instance API instead:

```powershell
$tokenBytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($tokenBytes)
}
finally {
    $rng.Dispose()
}
$serviceToken = [Convert]::ToBase64String($tokenBytes)
```

### The initial revision failed to start

The long `--set-env-vars` argument was split inside the artifact path. This corrupted the value and also prevented the secret attachment from reaching the revision. Application startup then failed with:

```text
RuntimeError: MICROMANUS_AGENT_SERVICE_TOKEN is required in production
```

The correction used short PowerShell variables and explicit secret version 2:

```powershell
$secretName = "micromanus-agent-service-token"
$secretRef = "MICROMANUS_AGENT_SERVICE_TOKEN=${secretName}:2"

gcloud.cmd run services update micromanus-agent `
  --region=us-central1 `
  --update-env-vars=MICROMANUS_AGENT_ARTIFACT_DIR=/tmp/micromanus/artifacts `
  --update-secrets=$secretRef
```

Do not split a quoted environment-variable value or secret name across lines.

## Immediate next steps

### 1. Configure Vercel

Add these variables to the Vercel web project for Production and Preview:

```text
AGENT_SERVICE_URL=https://micromanus-agent-788512849748.us-central1.run.app
AGENT_SERVICE_TOKEN=<the exact value stored in secret version 2>
```

If the original deployment PowerShell window is still open, copy the token without printing it:

```powershell
Set-Clipboard -Value $serviceToken
```

Redeploy the Vercel project after saving both variables. Clear the local variable afterward:

```powershell
$serviceToken = $null
```

If the PowerShell variable has been lost, do not rotate the secret merely to view it. An authorized owner can access version 2 through Secret Manager and then update both Cloud Run and Vercel together if rotation is required.

### 2. Run end-to-end verification

1. Open the production web application.
2. Start a new chat.
3. Select a provider/model and supply the required BYOK credential.
4. Send a short prompt without web search.
5. Confirm that status and token-usage events stream to the UI.
6. Send a follow-up message in the same thread.
7. Run one web-search request.
8. Generate and download a PDF report.
9. Check Cloud Run logs for authentication errors, timeouts, or restarts.

### 3. Add cost controls

Create a small Google Cloud Billing budget with notifications at 50%, 90%, and 100%. A budget sends alerts but does not stop spending. The current deployment limits exposure with zero minimum instances and one maximum instance.

Review the effective scaling configuration:

```powershell
gcloud.cmd run services describe micromanus-agent `
  --region=us-central1 `
  --format="yaml(spec.template.metadata.annotations,spec.template.spec.containerConcurrency,spec.template.spec.timeoutSeconds)"
```

## Persistence limitation

Cloud Run containers are disposable. The current paths are:

```text
MICROMANUS_AGENT_CHECKPOINT_DB_PATH=/tmp/micromanus/checkpoints.sqlite
MICROMANUS_AGENT_ARTIFACT_DIR=/tmp/micromanus/artifacts
```

SQLite checkpoints and generated PDFs can disappear whenever Cloud Run replaces or scales down the instance. Limiting the service to one instance prevents simultaneous independent SQLite databases, but it does not make the filesystem durable.

Before treating the service as production-ready:

1. Add a shared Postgres LangGraph checkpointer, preferably using the existing Supabase project.
2. Store generated PDFs in Supabase Storage or another object store.
3. Keep only temporary working files under `/tmp`.
4. Remove the one-instance restriction after shared state and cross-instance locking are implemented.

## Future deployments

Run future source deployments from the repository root. Variables keep long values from being accidentally split:

```powershell
$projectId = "micromanus-502805"
$runnerSa = "micromanus-runner@$projectId.iam.gserviceaccount.com"
$secretName = "micromanus-agent-service-token"
$secretRef = "MICROMANUS_AGENT_SERVICE_TOKEN=${secretName}:2"
$runtimeEnv = "MICROMANUS_AGENT_ENVIRONMENT=production,MICROMANUS_AGENT_CHECKPOINT_BACKEND=sqlite,MICROMANUS_AGENT_CHECKPOINT_DB_PATH=/tmp/micromanus/checkpoints.sqlite,MICROMANUS_AGENT_ARTIFACT_DIR=/tmp/micromanus/artifacts"

Push-Location "services\agent"

gcloud.cmd run deploy micromanus-agent `
  --source=. `
  --region=us-central1 `
  --allow-unauthenticated `
  --service-account=$runnerSa `
  --port=8080 `
  --cpu=1 `
  --memory=512Mi `
  --concurrency=10 `
  --timeout=600 `
  --min-instances=0 `
  --max-instances=1 `
  --set-env-vars=$runtimeEnv `
  --set-secrets=$secretRef

Pop-Location
```

Verify after every deployment:

```powershell
$agentUrl = gcloud.cmd run services describe micromanus-agent `
  --region=us-central1 `
  --format="value(status.url)"

Invoke-RestMethod "$agentUrl/health"
```

## Logs and revision management

Read recent application logs:

```powershell
gcloud.cmd logging read "resource.type=cloud_run_revision AND resource.labels.service_name=micromanus-agent" `
  --project=micromanus-502805 `
  --freshness=1h `
  --limit=100
```

List revisions:

```powershell
gcloud.cmd run revisions list `
  --service=micromanus-agent `
  --region=us-central1
```

Route traffic back to a known-good revision if a later deployment fails:

```powershell
gcloud.cmd run services update-traffic micromanus-agent `
  --region=us-central1 `
  --to-revisions=REVISION_NAME=100
```

## Repository cleanup to consider

The repository still contains Hugging Face and paid Render deployment assumptions. After the Cloud Run and Vercel integration is verified:

1. Update the root deployment documentation to make Cloud Run the supported agent deployment.
2. Remove or archive the Hugging Face-specific README metadata and entrypoint if they are no longer needed.
3. Replace or remove the paid-disk `render.yaml` Blueprint to prevent accidental paid deployment.
4. Keep provider credentials out of Google Cloud environment variables; they remain request-scoped BYOK values.
