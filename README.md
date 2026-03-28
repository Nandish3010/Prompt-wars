# CrisisConnect — Emergency Dispatch Assistant

> PromptWars Hackathon | Societal Benefit vertical

Turn chaotic, panicked incident reports into structured emergency dispatch cards — powered by Google Gemini AI.

---

## Chosen Vertical / Persona

**Emergency Dispatcher Assistant.**

User: anyone witnessing or reporting an emergency — bystander, journalist, NGO field worker, or dispatcher trainee. Input is raw panic. Output is a standardized dispatch card ready for emergency services.

---

## How It Works

1. User describes the incident in plain text (e.g. "huge crash on 5th, someone bleeding cant move")
2. Optionally attaches a photo of the scene
3. Clicks **Analyze Incident**
4. Gemini 2.0 Flash (multimodal) processes text + image
5. A structured dispatch card renders instantly with severity, location, injuries, required resources
6. Google Maps shows a pin at the extracted location (when confidence is HIGH or MEDIUM)

---

## Approach & Logic

- **Gemini multimodal + structured JSON:** System instruction forces Gemini to return only valid JSON matching a strict schema. The `shared/parseDispatch.ts` module strips markdown fences (Gemini sometimes wraps output in ` ```json ``` `), parses, and validates every field before rendering.
- **Severity triage:** Gemini classifies `CRITICAL | HIGH | MEDIUM | LOW`. Color-coded badges use WCAG AA-compliant contrast ratios.
- **Location chain:** Gemini extracts a human-readable location string → Google Maps Embed API renders it as a real map pin. Two Google services, one visible chain.
- **Server-side proxy:** The Next.js API route (`/api/analyze`) runs server-side only inside the Cloud Run container. The Gemini API key never reaches the browser.

---

## Google Services Used

| Service | Role |
|---|---|
| **Gemini 2.0 Flash** | Core AI — multimodal text + vision, structured JSON output |
| **Google Cloud Run** | Hosts the containerized Next.js app (SSR + API routes) |
| **Google Artifact Registry** | Stores the Docker image for Cloud Run |
| **Google Maps Embed API** | Visualizes the Gemini-extracted incident location |

---

## Assumptions

1. This is a demonstration tool — not a replacement for real 911 systems. Always call 911.
2. API key is stored in Google Secret Manager and injected at runtime via Cloud Run secrets.
3. Image inputs are validated (JPG/PNG/WebP, max 4MB) before base64-encoding to Gemini.
4. Gemini output is validated against a strict schema before any data reaches the DOM.
5. Location extraction is best-effort — LOW confidence locations show a warning and no map.

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, React 18
- **AI:** Gemini 2.0 Flash via `@google/generative-ai` SDK
- **Deployment:** Google Cloud Run (containerized with Docker)
- **Tests:** Vitest + React Testing Library

---

## Setup (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Add your Gemini API key
cp .env.example .env.local
# Edit .env.local and set GEMINI_API_KEY=your_key_here

# 3. Run dev server
npm run dev
# Open http://localhost:3000
```

---

## Running Tests

```bash
npm test                 # run all tests once
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report (target: >80% on critical paths)
```

---

## Deploy to Google Cloud Run

### Prerequisites

```bash
# Install Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud config set project quick-pointer-491605-n4
```

### 1. Store your Gemini API key in Secret Manager

```bash
# Create the secret (paste your key when prompted, then Ctrl+D)
echo -n "your_gemini_api_key_here" | gcloud secrets create GEMINI_API_KEY \
  --data-file=- \
  --replication-policy=automatic
```

### 2. Build and deploy to Cloud Run

```bash
# Deploy directly from source — Cloud Build builds the Docker image,
# pushes to Artifact Registry, and deploys to Cloud Run in one command
gcloud run deploy crisisconnect \
  --source . \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

### 3. Verify

```bash
# Get the deployed URL
gcloud run services describe crisisconnect \
  --region asia-south1 \
  --format "value(status.url)"
```

Open the URL, submit a test incident — you should see a dispatch card + Google Maps pin.

### Security verification

Open DevTools → Network tab → inspect the `/api/analyze` response. The `GEMINI_API_KEY` value must never appear in any response body or header.

---

## Project Structure

```
app/
  api/analyze/route.ts    ← Server-side Gemini proxy (key never leaves here)
  layout.tsx
  page.tsx
  globals.css
components/
  IncidentForm.tsx        ← Input form with double-submit guard
  DispatchCard.tsx        ← Structured dispatch card renderer
  LocationMap.tsx         ← Google Maps Embed for extracted location
shared/
  dispatch.ts             ← DispatchReport interface + enums
  parseDispatch.ts        ← JSON parse + schema validation
test/
  unit/                   ← Vitest unit tests (pure functions)
  integration/            ← API route tests with mocked Gemini
Dockerfile                ← Multi-stage build for Cloud Run
```
