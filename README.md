# Chat Studio

Chat Studio is a secure, multimodal AI workspace for conversations, knowledge search, image analysis, document summaries, and meeting notes. The interface keeps the original black, white, and yellow visual identity while replacing the legacy demo controls with capability-driven workflows.

## Features

- Microsoft Entra ID authentication using separate SPA and API app registrations
- `ChatStudio.Admin` role protection for shared knowledge uploads and deletion
- PostgreSQL-backed, user-owned conversation history
- Model-aware Chat, Knowledge, Vision, Document, and Meeting modes
- RAG citations and follow-up questions preserved from the AI service
- Validated image, document, audio, and video handling
- Responsive desktop and mobile workspace
- Health and readiness endpoints
- Separate Docker Compose stacks for development, unit tests, and integration tests

## Requirements

- Node.js 22 or newer
- Docker Desktop with Docker Compose
- A PostgreSQL database when running outside Compose
- Microsoft Entra SPA and API app registrations
- An Azure OpenAI-compatible API endpoint and key

## Configuration

Update the provided `.env.dev` file with your development values. It is ignored by Git and used automatically by the `make dev-*` commands. Use `.env.example` as the safe reference template for other environments.

- `AI_API_ENDPOINT`: base URL for the Azure OpenAI-compatible gateway
- `AI_API_KEY`: gateway API key
- `AI_MODEL_DEPLOYMENTS`: JSON object mapping Chat Studio model IDs to upstream deployment names
- `AI_DEFAULT_MODEL`: an enabled model ID selected by default
- `PROVIDER_SETTINGS_ENCRYPTION_KEY`: base64-encoded 32-byte key used to encrypt user-managed provider API keys in PostgreSQL
- `LOG_LEVEL`: logging threshold (`debug`, `info`, `warn`, or `error`); development defaults to `debug`
- `DATABASE_URL`: PostgreSQL connection string
- `ENTRA_TENANT_ID`: Microsoft Entra tenant identifier
- `ENTRA_SPA_CLIENT_ID`: public client ID used by MSAL in the browser
- `ENTRA_API_CLIENT_ID`: protected API application client ID and token audience
- `ENTRA_API_SCOPE`: delegated scope value, normally `access_as_user`
- `ENTRA_ADMIN_ROLE`: app role allowed to upload and delete knowledge documents

`AUTH_DISABLED=true` is available for isolated local development and automated tests. Never enable it on a shared or publicly reachable deployment.

The former `INCUBATOR_ENDPOINT` and `INCUBATOR_KEY` variables are no longer read. Rename them in your local `.env` to `AI_API_ENDPOINT` and `AI_API_KEY`.

The supported model IDs are `gpt-5.4-mini` and `gpt-5.4`. Deployment names can differ from those IDs:

```dotenv
AI_MODEL_DEPLOYMENTS={"gpt-5.4-mini":"your-mini-deployment","gpt-5.4":"your-full-deployment"}
AI_DEFAULT_MODEL=gpt-5.4-mini
```

Capabilities remain server-owned and validated. Unknown model IDs or a default model missing from the mapping prevent startup.

Generate the provider settings encryption key with `openssl rand -base64 32`. Keep it stable for each environment: changing it prevents the server from decrypting existing saved provider API keys.

Signed-in users can configure Azure OpenAI endpoint, API key, and deployment name from the provider settings control. The API key is encrypted before database persistence and is never returned to the browser after saving.

## Microsoft Entra Setup

1. Create an API app registration and expose a delegated `access_as_user` scope.
2. Add an application role with the value `ChatStudio.Admin`, assignable to users or groups.
3. Create a SPA app registration with `http://localhost:3000/auth/callback.html` as a development redirect URI.
4. Grant the SPA delegated permission to `api://<ENTRA_API_CLIENT_ID>/access_as_user`.
5. Grant tenant consent as required by your organization.
6. Assign `ChatStudio.Admin` only to users who manage shared knowledge documents.

The API validates signature, issuer, audience, expiry, tenant, and delegated scope. Authenticated users own their conversations; only the admin app role can mutate shared knowledge.

Browser authentication uses MSAL Authorization Code Flow with PKCE and full-page redirects through `http://localhost:3000/auth/callback.html`. It does not use popup or implicit-grant flows.

## Local Development

Start the application and PostgreSQL with `make dev-up`. Open [http://localhost:3000](http://localhost:3000), follow logs with `make dev-logs`, and stop the stack with `make dev-down`.

For a local Node process, point `DATABASE_URL` at an available PostgreSQL instance, run `npm ci`, then `npm run dev`. Database migrations under `migrations/` run automatically during startup.

## Tests

Run `npm run lint` and `npm run test:unit` locally. Dedicated containers are available through `make test-unit` and `make test-integration`.

The integration stack uses PostgreSQL and a deterministic mock AI endpoint. It does not contact Microsoft Entra or consume real AI credentials.

## API

Public endpoints: `GET /health/live`, `GET /health/ready`, `GET /api/config`, and `GET /api/models`.

Authenticated endpoints: `GET|POST /api/conversations`, `GET|PATCH|DELETE /api/conversations/:id`, `DELETE /api/conversations/:id/messages`, `POST /api/chat`, `GET /listfiles`, and `POST /upload-audio`.

Admin endpoints: `POST /upload` and `DELETE /deletefile/:filename`.

## Security Notes

- Rotate any historical upstream key that may have entered Git history, a shared archive, logs, or Docker build cache.
- `.dockerignore` excludes `.env` and `uploads/` from all image layers.
- Chat prompts, transcripts, image payloads, access tokens, and complete upstream responses are not logged.
- Uploaded files are type/size restricted and removed from temporary storage in `finally` blocks.
- Automated tests use dummy credentials and local mock services only.
