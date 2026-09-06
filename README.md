# Chat Studio

Chat Studio is a secure, multimodal workspace for organization-owned AI conversations. Authenticated users can manage their own conversations, choose configured Azure OpenAI deployments, work with approved knowledge, and use Chat, Knowledge, Vision, Document, and Meeting modes.

The public shell is intentionally read-only. Users sign in with Microsoft Entra ID before Chat Studio loads conversations or calls protected APIs.

## What It Includes

- Microsoft Entra ID sign-in for a browser SPA and protected API
- PostgreSQL persistence for users, conversations, messages, and session token usage
- Per-user encrypted Azure OpenAI provider settings
- Multiple user-configured model deployments with selectable capabilities and an active default
- Chat, knowledge, vision, document, and meeting work modes
- Shared knowledge management restricted to the `ChatStudio.Admin` role
- File validation for image, document, audio, and video workflows
- Health and readiness endpoints for container orchestration
- Docker Compose environments for local development, unit tests, and integration tests

## Prerequisites

- Node.js 22 or later
- Docker Desktop with Docker Compose
- Microsoft Entra SPA and API app registrations for authenticated development
- An Azure OpenAI-compatible endpoint and API key for environment-backed runtime configuration

## Configure

Create a local `.env.dev` from [.env.example](.env.example). The file is ignored by Git and is used by the `make dev-*` commands.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string when running Node outside Docker Compose. |
| `AI_API_ENDPOINT` | Azure OpenAI-compatible runtime endpoint. |
| `AI_API_KEY` | API key for the environment-backed runtime. |
| `AI_API_VERSION` | Azure OpenAI API version. |
| `AI_MODEL_DEPLOYMENTS` | JSON mapping of Chat Studio model IDs to deployment names. |
| `AI_DEFAULT_MODEL` | Default model ID from `AI_MODEL_DEPLOYMENTS`. |
| `PROVIDER_SETTINGS_ENCRYPTION_KEY` | Base64-encoded 32-byte key for encrypted user-managed provider credentials. |
| `ENTRA_TENANT_ID` | Microsoft Entra tenant ID. |
| `ENTRA_SPA_CLIENT_ID` | Public SPA application client ID. |
| `ENTRA_API_CLIENT_ID` | Protected API application client ID and token audience. |
| `ENTRA_API_SCOPE` | Delegated API scope. Defaults to `access_as_user`. |
| `ENTRA_ADMIN_ROLE` | App role for knowledge-base administration. Defaults to `ChatStudio.Admin`. |
| `AUTH_DISABLED` | Local/test-only bypass for Entra authentication. Never enable in shared deployments. |

Generate `PROVIDER_SETTINGS_ENCRYPTION_KEY` with:

```sh
openssl rand -base64 32
```

Keep that key stable for an environment. Changing it makes previously saved provider credentials unreadable.

Environment model deployments use a JSON mapping, for example:

```dotenv
AI_MODEL_DEPLOYMENTS={"gpt-5.4-mini":"your-mini-deployment","gpt-5.4":"your-full-deployment"}
AI_DEFAULT_MODEL=gpt-5.4-mini
```

After signing in, users may instead configure a personal Azure OpenAI connection in the provider settings dialog. Saved API keys are encrypted before PostgreSQL persistence, are never returned to the browser, and can be replaced without exposing the existing value. Personal provider settings take precedence over environment-backed AI settings for that user.

## Microsoft Entra Setup

1. Create an API app registration and expose an `access_as_user` delegated scope.
2. Create a SPA app registration with `http://localhost:3000/auth/callback.html` as a development redirect URI.
3. Grant the SPA delegated permission to `api://<ENTRA_API_CLIENT_ID>/access_as_user`.
4. Create and assign the `ChatStudio.Admin` application role only to knowledge-base administrators.
5. Configure the tenant, SPA client, API client, scope, and role values in `.env.dev`.

The browser uses MSAL Authorization Code Flow with PKCE and a full-page redirect. The API verifies token signature, issuer, audience, tenant, expiry, delegated scope, and role claims before authorizing protected operations.

## Run Locally

Start the application and PostgreSQL:

```sh
make dev-up
```

Open [http://localhost:3000](http://localhost:3000). Follow application logs with `make dev-logs`, then stop the stack with:

```sh
make dev-down
```

To run the Node process without Docker Compose, provide a reachable PostgreSQL `DATABASE_URL`, install dependencies, and start the development server:

```sh
npm ci
npm run dev
```

Database migrations in [`migrations/`](migrations/) run during server startup.

## Validate

Run fast local checks:

```sh
npm run lint
npm run test:unit
```

Run Compose-backed suites:

```sh
make test-unit
make test-integration
```

Run the full delivery check, including dependency audit, lint, unit tests, integration tests, and Compose cleanup:

```sh
make check
```

## API Surface

Public endpoints:

- `GET /health/live`
- `GET /health/ready`
- `GET /api/config`
- `GET /api/models`

Authenticated endpoints include conversation CRUD, chat completions, usage totals, profile access, provider settings, configured-model management, and approved knowledge access. Knowledge uploads and deletions require the `ChatStudio.Admin` role.

## Security

- Do not commit `.env.dev`, credentials, tokens, uploads, or copied production data.
- Rotate any historical upstream key that entered Git history, archives, logs, or image layers.
- Prompts, transcripts, image payloads, access tokens, and full upstream responses are excluded from application logs.
- `.dockerignore` excludes `.env` files and uploads from image layers.
- Uploaded files are type- and size-restricted, and temporary files are removed after processing.
- Tests use dummy credentials and a deterministic local mock AI endpoint; integration tests do not call Microsoft Entra or consume real provider credentials.
