import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import {
  decodePaymentRequiredHeader, encodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http';
import type { PaymentPayload } from '@x402/core/types';
import { BudgetLedger, BuyerGateway } from '../src/buyer/index.ts';
import type { PurchaseRequest } from '../src/buyer/index.ts';
import { x402PurchaseAdapter } from '../src/payments/client.ts';
import { FixtureFacilitator, fixtureClient } from '../src/payments/fixture.ts';
import { startPaidReportServer } from '../src/payments/server.ts';
import { DEVNET_NETWORK, DEVNET_USDC, REPORT_PRICE_UNITS } from '../src/shared/config.ts';

// Entire suite is an offline protocol fixture using loopback HTTP. No blockchain
// calls, real signatures, real token transfers, or devnet settlement take place.
const PAY_TO = '11111111111111111111111111111111';

async function serverFor(t: TestContext, makeReport: () => unknown | Promise<unknown> = () => ({
  evidence: 'SYNTHETIC_FIXTURE_ONLY', incomingRaw: '1000000',
}), facilitator = new FixtureFacilitator()) {
  const server = await startPaidReportServer({
    facilitator, payTo: PAY_TO, makeReport, mode: 'local-fixture',
  });
  t.after(() => server.close());
  return { server, facilitator };
}

function buyer(url: string) {
  const ledger = new BudgetLedger({
    network: DEVNET_NETWORK, mint: DEVNET_USDC,
    projects: [{ id: 'fixture-project', limit: REPORT_PRICE_UNITS }],
    agents: [{ id: 'fixture-agent', projectId: 'fixture-project', limit: REPORT_PRICE_UNITS }],
    providers: [{ id: 'fixture-provider', payTo: PAY_TO, resources: [url] }],
  });
  const request: PurchaseRequest = {
    idempotencyKey: 'fixture-purchase', projectId: 'fixture-project', agentId: 'fixture-agent',
    providerId: 'fixture-provider', network: DEVNET_NETWORK, mint: DEVNET_USDC,
    payTo: PAY_TO, amount: REPORT_PRICE_UNITS, resource: url,
  };
  return { ledger, gateway: new BuyerGateway(ledger), request };
}

async function payloadFor(url: string): Promise<PaymentPayload> {
  const response = await fetch(url);
  assert.equal(response.status, 402);
  const required = decodePaymentRequiredHeader(response.headers.get('PAYMENT-REQUIRED')!);
  return fixtureClient().createPaymentPayload(required);
}

async function pay(url: string, payload: PaymentPayload, key: string) {
  return fetch(url, {
    headers: { 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload), 'Idempotency-Key': key },
  });
}

test('unpaid HTTP request returns a V2 quote without verifying, generating, or settling', async t => {
  const { server, facilitator } = await serverFor(t);
  const response = await fetch(server.url);
  assert.equal(response.status, 402);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const required = decodePaymentRequiredHeader(response.headers.get('PAYMENT-REQUIRED')!);
  assert.equal(required.x402Version, 2);
  assert.equal(required.resource.url, server.url);
  assert.equal(required.accepts[0].network, DEVNET_NETWORK);
  assert.equal(required.accepts[0].amount, REPORT_PRICE_UNITS.toString());
  const body = await response.json() as { report?: unknown; mode: string };
  assert.equal(body.mode, 'local-fixture');
  assert.equal(body.report, undefined);
  assert.equal(server.metrics.reports, 0);
  assert.equal(facilitator.verifications, 0);
  assert.equal(facilitator.settlements, 0);
});

test('fixture protocol verifies before generating and settling, then commits the buyer budget', async t => {
  const events: string[] = [];
  const facilitator = new FixtureFacilitator();
  const verify = facilitator.verify.bind(facilitator);
  const settle = facilitator.settle.bind(facilitator);
  facilitator.verify = async (...args) => { events.push('verify'); return verify(...args); };
  facilitator.settle = async (...args) => { events.push('settle'); return settle(...args); };
  const { server } = await serverFor(t, () => {
    events.push('report');
    return { evidence: 'SYNTHETIC_FIXTURE_ONLY' };
  }, facilitator);
  const { ledger, gateway, request } = buyer(server.url);
  const receipt = await gateway.purchase(request, x402PurchaseAdapter(fixtureClient()));
  assert.equal(receipt.status, 'confirmed');
  if (receipt.status === 'confirmed') assert.match(receipt.signature, /^FIXTURE-ONLY:/);
  assert.deepEqual(events, ['verify', 'report', 'settle']);
  assert.equal(ledger.projectBalance('fixture-project').spent, REPORT_PRICE_UNITS);
  assert.equal(ledger.projectBalance('fixture-project').held, 0n);
});

test('invalid verification yields no resource or charge and releases the buyer reservation', async t => {
  const { server, facilitator } = await serverFor(t);
  facilitator.valid = false;
  const { ledger, gateway, request } = buyer(server.url);
  const receipt = await gateway.purchase(request, x402PurchaseAdapter(fixtureClient()));
  assert.equal(receipt.status, 'rejected');
  assert.equal(facilitator.verifications, 1);
  assert.equal(facilitator.settlements, 0);
  assert.equal(server.metrics.reports, 0);
  assert.equal(ledger.projectBalance('fixture-project').remaining, REPORT_PRICE_UNITS);
});

test('concurrent same-key requests and transaction replay under a new key settle only once', async t => {
  let unblock!: () => void;
  const pending = new Promise<void>(resolve => { unblock = resolve; });
  const { server, facilitator } = await serverFor(t, async () => {
    await pending;
    return { evidence: 'SYNTHETIC_FIXTURE_ONLY' };
  });
  const payload = await payloadFor(server.url);
  const requests = Array.from({ length: 20 }, (_, index) => pay(
    server.url, payload, index < 10 ? 'same-key' : 'another-key',
  ));
  unblock();
  const responses = await Promise.all(requests);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.ok(responses.every(response => response.status === 200));
  assert.ok(bodies.every(body => JSON.stringify(body) === JSON.stringify(bodies[0])));
  assert.equal(facilitator.verifications, 1);
  assert.equal(facilitator.settlements, 1);
  assert.equal(server.metrics.reports, 1);
  assert.equal(server.metrics.retries, 19);
  const completedReplay = await pay(server.url, payload, 'third-key');
  assert.equal(completedReplay.status, 200);
  assert.equal(facilitator.settlements, 1);
});

test('same idempotency key with a different authorization conflicts without another charge', async t => {
  const { server, facilitator } = await serverFor(t);
  const first = await payloadFor(server.url);
  const second = await payloadFor(server.url);
  assert.notEqual(first.payload.transaction, second.payload.transaction);
  assert.equal((await pay(server.url, first, 'bound-key')).status, 200);
  const conflict = await pay(server.url, second, 'bound-key');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json() as { error: string }).error, 'idempotency_conflict');
  assert.equal(facilitator.verifications, 1);
  assert.equal(facilitator.settlements, 1);
});

test('client rejects an amount-mismatched quote before creating or transmitting authorization', async t => {
  const { server, facilitator } = await serverFor(t);
  const client = fixtureClient();
  let creations = 0;
  const create = client.createPaymentPayload.bind(client);
  client.createPaymentPayload = async (...args) => { creations++; return create(...args); };
  let paidRequests = 0;
  const mismatchedHttp: typeof fetch = async (input, init) => {
    if (new Headers(init?.headers).has('PAYMENT-SIGNATURE')) paidRequests++;
    const response = await fetch(input, init);
    if (response.status !== 402) return response;
    const required = decodePaymentRequiredHeader(response.headers.get('PAYMENT-REQUIRED')!);
    required.accepts[0].amount = (REPORT_PRICE_UNITS + 1n).toString();
    return new Response(JSON.stringify(await response.json()), {
      status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required) },
    });
  };
  const { ledger, gateway, request } = buyer(server.url);
  const receipt = await gateway.purchase(request, x402PurchaseAdapter(client, mismatchedHttp));
  assert.equal(receipt.status, 'rejected');
  assert.equal(creations, 0);
  assert.equal(paidRequests, 0);
  assert.equal(facilitator.settlements, 0);
  assert.equal(ledger.projectBalance('fixture-project').remaining, REPORT_PRICE_UNITS);
});

test('server rejects changed required fee payer before verification or resource computation', async t => {
  const { server, facilitator } = await serverFor(t);
  const payload = await payloadFor(server.url);
  payload.accepted.extra.feePayer = 'fixture-wrong-fee-payer';
  const response = await pay(server.url, payload, 'wrong-fee-payer');
  assert.equal(response.status, 402);
  assert.equal((await response.json() as { error: string }).error, 'quote_mismatch');
  assert.equal(facilitator.verifications, 0);
  assert.equal(facilitator.settlements, 0);
  assert.equal(server.metrics.reports, 0);
});

test('settlement response loss retains budget and buyer/server retries cannot resettle', async t => {
  const { server, facilitator } = await serverFor(t);
  facilitator.throwAfterSettlement = true;
  const { ledger, gateway, request } = buyer(server.url);
  const adapter = x402PurchaseAdapter(fixtureClient());
  const first = gateway.purchase(request, adapter);
  const receipt = await first;
  assert.equal(receipt.status, 'uncertain');
  assert.equal(ledger.projectBalance('fixture-project').held, REPORT_PRICE_UNITS);
  assert.equal(ledger.projectBalance('fixture-project').spent, 0n);
  assert.equal(gateway.purchase(request, adapter), first);
  await gateway.purchase(request, adapter);
  assert.equal(facilitator.settlements, 1);
  const payload = await payloadFor(server.url);
  const uncertain = await pay(server.url, payload, 'another-uncertain-key');
  assert.equal(uncertain.status, 503);
  const count = facilitator.settlements;
  const replay = await pay(server.url, payload, 'uncertain-replay-new-key');
  assert.equal(replay.status, 503);
  assert.equal(facilitator.settlements, count);
  assert.equal((await replay.json() as { rejectedBeforeSettlement?: boolean }).rejectedBeforeSettlement, undefined);
});

test('transport response loss after the server settles is uncertain and never reauthorizes', async t => {
  const { server, facilitator } = await serverFor(t);
  let paidRequests = 0;
  const lostResponseHttp: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (new Headers(init?.headers).has('PAYMENT-SIGNATURE')) {
      paidRequests++;
      await response.arrayBuffer();
      throw new Error('FIXTURE transport response lost after server settlement');
    }
    return response;
  };
  const { ledger, gateway, request } = buyer(server.url);
  const adapter = x402PurchaseAdapter(fixtureClient(), lostResponseHttp);
  const receipt = await gateway.purchase(request, adapter);
  assert.equal(receipt.status, 'uncertain');
  await gateway.purchase(request, adapter);
  assert.equal(paidRequests, 1);
  assert.equal(facilitator.settlements, 1);
  assert.equal(ledger.projectBalance('fixture-project').held, REPORT_PRICE_UNITS);
});

test('report generation or serialization failure occurs before charge and releases budget', async t => {
  for (const makeReport of [
    () => { throw new Error('FIXTURE report unavailable'); },
    () => ({ unsupportedBigint: 1n }),
    () => { const cyclic: { cycle?: unknown } = {}; cyclic.cycle = cyclic; return cyclic; },
  ]) {
    const { server, facilitator } = await serverFor(t, makeReport);
    const { ledger, gateway, request } = buyer(server.url);
    const receipt = await gateway.purchase(request, x402PurchaseAdapter(fixtureClient()));
    assert.equal(receipt.status, 'rejected');
    assert.equal(facilitator.verifications, 1);
    assert.equal(facilitator.settlements, 0);
    assert.equal(ledger.projectBalance('fixture-project').remaining, REPORT_PRICE_UNITS);
  }
});

test('confirmed settlement still spends budget when the HTTP resource response fails', async t => {
  const { server, facilitator } = await serverFor(t);
  const failedResourceHttp: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (!new Headers(init?.headers).has('PAYMENT-SIGNATURE')) return response;
    const headers = new Headers(response.headers);
    await response.arrayBuffer();
    return new Response('{"error":"FIXTURE resource delivery failed after payment"}', { status: 500, headers });
  };
  const { ledger, gateway, request } = buyer(server.url);
  const receipt = await gateway.purchase(request, x402PurchaseAdapter(fixtureClient(), failedResourceHttp));
  assert.equal(receipt.status, 'confirmed');
  assert.equal(facilitator.settlements, 1);
  assert.equal(ledger.projectBalance('fixture-project').spent, REPORT_PRICE_UNITS);
});

test('pending settlement with a transaction is uncertain even after the SDK bounded retry', async t => {
  const facilitator = new FixtureFacilitator();
  facilitator.settle = async (_payload, requirements) => {
    facilitator.settlements++;
    return {
      success: false, network: requirements.network,
      transaction: 'FIXTURE-ONLY:already-broadcast-pending', errorReason: 'settlement_pending',
    };
  };
  const { server } = await serverFor(t, () => ({ evidence: 'SYNTHETIC_FIXTURE_ONLY' }), facilitator);
  const { ledger, gateway, request } = buyer(server.url);
  const receipt = await gateway.purchase(request, x402PurchaseAdapter(fixtureClient()));
  assert.equal(receipt.status, 'uncertain');
  assert.equal(facilitator.settlements, 2);
  assert.equal(ledger.projectBalance('fixture-project').held, REPORT_PRICE_UNITS);
});
