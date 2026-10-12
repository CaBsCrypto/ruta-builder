import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { BudgetLedger, BuyerGateway, BuyerError, type PurchaseRequest } from '../buyer/index.ts';
import { reconcileTransfers, toCsv } from '../reports/index.ts';
import { syntheticKnownBatch } from '../../fixtures/reports/synthetic.ts';
import { FixtureFacilitator, fixtureClient } from '../payments/fixture.ts';
import { startPaidReportServer } from '../payments/server.ts';
import { x402PurchaseAdapter } from '../payments/client.ts';
import { DEVNET_NETWORK, DEVNET_USDC, REPORT_PRICE_UNITS } from '../shared/config.ts';

const input = syntheticKnownBatch();
const start = performance.now();
const report = reconcileTransfers(input);
const reportElapsedMs = performance.now() - start;
const facilitator = new FixtureFacilitator();
const payTo = '11111111111111111111111111111111';
const server = await startPaidReportServer({ facilitator, payTo, mode: 'local-fixture', makeReport: () => report });
try {
  const ledger = new BudgetLedger({
    network: DEVNET_NETWORK, mint: DEVNET_USDC,
    projects: [{ id: 'research', limit: REPORT_PRICE_UNITS * 2n }],
    agents: [{ id: 'buyer-agent', projectId: 'research', limit: REPORT_PRICE_UNITS * 2n }],
    providers: [{ id: 'reports', payTo, resources: [server.url] }],
  });
  const gateway = new BuyerGateway(ledger);
  const adapter = x402PurchaseAdapter(fixtureClient());
  const request: PurchaseRequest = {
    idempotencyKey: 'demo-first', projectId: 'research', agentId: 'buyer-agent',
    providerId: 'reports', network: DEVNET_NETWORK, mint: DEVNET_USDC,
    payTo, amount: REPORT_PRICE_UNITS, resource: server.url,
  };
  const purchaseStart = performance.now();
  const [first, duplicate] = await Promise.all([gateway.purchase(request, adapter), gateway.purchase(request, adapter)]);
  const purchaseElapsedMs = performance.now() - purchaseStart;
  const concurrent = await Promise.allSettled([
    gateway.purchase({ ...request, idempotencyKey: 'demo-second' }, adapter),
    gateway.purchase({ ...request, idempotencyKey: 'demo-third' }, adapter),
  ]);
  assert.equal(first.status, 'confirmed', 'La compra simulada debe completar HTTP 402 → autorización → recibo.');
  assert.equal(first, duplicate, 'El reintento debe compartir el mismo recibo.');
  assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(item => item.status === 'rejected' && item.reason instanceof BuyerError && item.reason.code === 'PROJECT_BUDGET_EXCEEDED').length, 1);
  assert.equal(facilitator.settlements, 2, 'El duplicado y la compra fuera de presupuesto no deben liquidarse.');
  assert.equal(report.coverage.complete, true);
  assert.deepEqual(report.totals, {
    incomingRaw: '325000000', outgoingRaw: '338000000', internalRaw: '300000000',
    netRaw: '-13000000', observedBalanceDeltaRaw: '-13000000',
  });
  const evidence = {
    checkedAt: new Date().toISOString(), mode: 'local-fixture',
    realPaymentSettled: false, blockchainTransactionsSubmitted: 0,
    candidateA: {
      firstStatus: first.status, duplicateStatus: duplicate.status,
      sameReceipt: first === duplicate,
      concurrent: concurrent.map(item => item.status === 'fulfilled'
        ? { status: item.value.status }
        : { status: 'policy-rejected', code: item.reason instanceof BuyerError ? item.reason.code : 'unknown' }),
      budget: ledger.snapshot(), facilitator: { verifications: facilitator.verifications, simulatedSettlements: facilitator.settlements },
      http: server.metrics, purchaseElapsedMs,
    },
    candidateB: {
      dataset: '50 firmas SINTÉTICAS conocidas; no son movimientos de una wallet real.',
      coverageScope: 'Sólo el lote solicitado; no representa la historia de una tesorería.',
      totals: report.totals, coverage: report.coverage, transfers: report.transfers.length,
      reportElapsedMs,
      narrative: {
        kind: 'deterministic-template', aiModelUsed: false,
        text: `El lote contiene ${report.transfers.length} transferencias relevantes. Entrada: ${report.totals.incomingRaw} unidades mínimas; salida: ${report.totals.outgoingRaw}.`,
        evidence: report.transfers.map(transfer => ({ signature: transfer.signature, instructionPath: transfer.instructionPath })),
      },
    },
    decision: 'Abierta: la corrección técnica local no confirma demanda ni disposición a pagar.',
  };
  const json = (value: unknown) => JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry, 2) + '\n';
  await mkdir('output', { recursive: true });
  await writeFile('output/comparison.json', json(evidence));
  await writeFile('output/report-synthetic.json', json({ source: input, report }));
  await writeFile('output/report-synthetic.csv', toCsv(report));
  console.log(json({
    mode: evidence.mode, realPaymentSettled: false,
    buyer: { first: first.status, duplicate: duplicate.status, sameReceipt: first === duplicate,
      concurrent: evidence.candidateA.concurrent, simulatedSettlements: facilitator.settlements },
    reports: { signatures: input.requestedSignatures.length, transfers: report.transfers.length, totals: report.totals, completeBatch: report.coverage.complete },
    files: ['output/comparison.json', 'output/report-synthetic.json', 'output/report-synthetic.csv'],
  }));
} finally { await server.close(); }
