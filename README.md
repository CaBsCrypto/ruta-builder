# Ruta Builder · Solana first

From idea to application: describe your project, review its context, compare opportunity requirements and prepare an editable draft. Built by **cabs**, a solo builder using AI-assisted development. [MIT license](LICENSE).

[Explore the public demo](https://ruta-builder-cabscryptocontacto-6028s-projects.vercel.app/) · [GitHub](https://github.com/CaBsCrypto/ruta-builder) · [CI](https://github.com/CaBsCrypto/ruta-builder/actions/workflows/ci.yml)

## Public demo

The English landing opens a five-step builder journey. No account or wallet is required. Profiles, edits and reports stay in this browser's local storage. Example sources are synthetic; submitted URLs remain declarations and are not fetched. Reports use a deterministic local template. Access is simulated, without signatures, OpenAI requests, RPC calls or transfers.

The opportunity catalog replays listings reviewed on **October 11, 2026**. It does not establish current availability or eligibility. Check each official source. Grants, prizes, accelerators and service credits are distinct forms of support.

**Real devnet purchase remains pending.** The public demo does not prove on-chain x402 settlement. The website and GitHub reader, Express backend, SQLite persistence and simulated HTTP payment tests are available locally in this repository. [Public demo details](docs/public-demo.md).

## Run locally

Requires Node.js **22.20 or later** and npm.

```powershell
npm ci
npm run build
npm run coach:demo
```

Open http://127.0.0.1:4311. Try a synthetic example or your own idea. Local demo AI and payments are simulated. The local reader can inspect public sources, with coverage and omissions visible. No wallet is signed and no tokens move in demo mode.

The private HttpOnly session cookie lasts 30 days; only its hash is stored. SQLite at .cache/coach-demo.sqlite preserves projects and access across restarts. Keep both cookie and database to recover the session. The server binds to loopback. Stop it with Ctrl+C.

```powershell
npm run typecheck
npm test
npm run build:public
npm run coach:smoke
```

For UI development, start the backend with COACH_PUBLIC_ORIGIN=http://127.0.0.1:4310, then run npm run web:dev. Vite proxies the API to port 4311. Resource quotes use the configured origin, never the Host header.

## Connected implementation

Copy .env.example to .env, configure OPENAI_API_KEY and a public Solana devnet receiving address in COACH_PAY_TO, then run npm run coach:start. This uses .cache/coach-devnet.sqlite. Wallet Standard signing is local, with no custody; the facilitator handles settlement. The **0.01 USDC** price uses test tokens and is not a commercial price.

Responses API supports structured output and a persistent maximum of three attempts per revision. An invalid output is not replaced by a demo and cannot be offered for payment. Real OpenAI calls, wallet signing and on-chain settlement remain unverified in this product. Do not run devnet:purchase to reproduce this delivery.

## Evidence and reports

- HTTPS inspection pins DNS and blocks private destinations. It reads at most three pages on one site and 30 repository text files pinned to a commit, without executing code. Limits: 256 KiB per response, 3 MiB total and 30 seconds. Credentials are excluded or redacted.
- Observations, declarations and inferences retain references and review dates. A README, dependency or import does not prove a working integration, users or spending.
- Local rules exclude closed, paused, expired and stale listings. Revalidate research/coach-catalog.json manually. Organizers confirm admission and eligibility.
- Reports are validated before payment and frozen against inputs, evidence, catalog and generation version. The free preview does not reveal the full report.
- Uncertain settlement blocks another authorization, including after restart. Reconciliation requires external review; there is no automatic resend or unlock shortcut.
- Draft edits are separate browser-local copies. Original reports and existing user input are preserved, including earlier Spanish reports. New public and backend-generated drafts use English. Source quotations and user declarations remain verbatim.

## Marketing and prior work

The current marketing film is **45 seconds**, with English text and screenshots, generic synthetic English narration and original instrumental music. [Editable sources and rendering instructions](marketing/README.md). It is a marketing clip; the separate longer Encode submission video remains pending.

The [encode-prehackathon-2026-10-11 tag](https://github.com/CaBsCrypto/ruta-builder/tree/encode-prehackathon-2026-10-11) preserves the code published before the build window. Disclose it as prior work. Research and preparation do not establish registration or submission.

Buyer/payment prototypes in src/buyer and src/payments, and USDC reporting in src/reports, remain available. A future community-funded microgrants stage can reuse reporting; a fund is not part of the current product.

Historical documents remain in their original language: [MVP/API](docs/mvp.md), [Encode plan](docs/encode-plan.md), [research](docs/research.md), [microgrant reporting](docs/microgrant-renditions.md).
