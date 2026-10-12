# Public demo for Encode

Ruta Builder helps Solana builders prepare an evidence-aware diagnosis, work plan and application draft. The hosted demo walks through the product without credentials or tokens. Builder: **cabs**, individual participant. Source code is licensed under MIT.

## What this deployment demonstrates

- Guided project intake and optional target programme.
- Three clearly labelled reference projects, or the visitor's own declared project.
- Source coverage, missing facts and requirement comparisons.
- A frozen demonstration report, editable draft, Markdown/JSON downloads and resuming in the same browser.

The public deployment is static. Project records and drafts are stored only in that browser's localStorage; they are not uploaded to our backend. It does not inspect submitted website/GitHub URLs. Source observations use synthetic examples; custom profiles remain declarations with partial coverage. The catalogue replays the snapshot reviewed on 11 October 2026, not live programme availability. Visitors should verify current terms at official sources.

Content generation uses a deterministic template. Unlocking a report is a simulation, not a token purchase. No OpenAI API calls, wallet signatures, RPC submissions or x402 settlement occur in the hosted demo. It does not contain private SQLite sessions, wallet keys or the author's application drafts.

## Reproduce the public build

```sh
npm ci
npm run build:public
npm run demo:public
```

Open the printed URL, select an example, confirm the profile, choose an opportunity, prepare the report and select **Ver informe de demostración**. Edit and download the application; reload and resume the same project.

## Reproduce the full backend

```sh
npm run build
npm run coach:demo
npm run coach:smoke
```

The local Express/SQLite implementation performs the HTTP 402 exchange with the official SDK and a synthetic facilitator; it retains idempotency, immutable report versions and receipts across restarts. Its separate connected mode supports Responses API and Wallet Standard signing on Solana devnet, but **real wallet signing and on-chain settlement remain unvalidated and deferred by the builder**. Test price: 0.01 devnet USDC, without a commercial pricing claim.

## Submission status

All code present on 11 October 2026 must be disclosed as work predating the hackathon. Public repository and demo are delivery assets; they do not imply acceptance, judging eligibility or an application already submitted. The demo video and proof of on-chain x402 settlement remain outstanding.
