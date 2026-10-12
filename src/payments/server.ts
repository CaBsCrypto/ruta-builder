import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import express from 'express';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { ExactSvmScheme } from '@x402/svm/exact/server';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { DEVNET_NETWORK, DEVNET_USDC, REPORT_PRICE_UNITS } from '../shared/config.ts';

type ResponseRecord = { status: number; headers?: Record<string, string>; body: unknown };
export interface PaidServerOptions {
  facilitator: FacilitatorClient;
  payTo: string;
  makeReport: () => unknown | Promise<unknown>;
  mode: 'local-fixture' | 'devnet';
}

// Explicit field ordering avoids binding retries to incidental JSON key order.
function terms(requirement: PaymentRequirements): string {
  return JSON.stringify([requirement.scheme, requirement.network, requirement.asset,
    requirement.amount, requirement.payTo, requirement.maxTimeoutSeconds]);
}

/** One process, one immutable report endpoint. Caches are deliberately not durable. */
export async function startPaidReportServer(options: PaidServerOptions) {
  const resourceServer = new x402ResourceServer(options.facilitator)
    .register(DEVNET_NETWORK, new ExactSvmScheme());
  await resourceServer.initialize();
  const requirements = await resourceServer.buildPaymentRequirements({
    scheme: 'exact', network: DEVNET_NETWORK, payTo: options.payTo,
    price: { asset: DEVNET_USDC, amount: REPORT_PRICE_UNITS.toString() },
    maxTimeoutSeconds: 60,
  });
  const app = express();
  app.disable('x-powered-by');
  let url = '';
  const byKey = new Map<string, { binding: string; operation: Promise<ResponseRecord> }>();
  const byTransaction = new Map<string, Promise<ResponseRecord>>();
  const metrics = { requests: 0, verifications: 0, settlementAttempts: 0, reports: 0, retries: 0 };

  const unpaid = async (error?: string): Promise<ResponseRecord> => {
    const required = await resourceServer.createPaymentRequiredResponse(requirements,
      { url, description: 'Reporte USDC de un lote conocido', mimeType: 'application/json' }, error);
    return { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required) },
      body: { error: error ?? 'payment_required', rejectedBeforeSettlement: true, mode: options.mode } };
  };

  const processPayment = async (payload: PaymentPayload, requirement: PaymentRequirements): Promise<ResponseRecord> => {
    // Verification and computation precede settlement; never release a paid result early.
    try {
      metrics.verifications++;
      const verified = await resourceServer.verifyPayment(payload, requirement);
      if (!verified.isValid) return unpaid(verified.invalidReason ?? 'invalid_payment');
    } catch {
      return { status: 503, body: { error: 'verification_unavailable', rejectedBeforeSettlement: true } };
    }
    let report: unknown;
    try {
      // Confirm that the complete resource can be delivered before charging. Otherwise
      // res.json() can fail after settlement (for example for bigint/cyclic values).
      const serialized = JSON.stringify(await options.makeReport());
      if (serialized === undefined) throw new Error('Report is not JSON serializable.');
      report = JSON.parse(serialized);
      metrics.reports++;
    }
    catch { return { status: 500, body: { error: 'report_generation_failed', rejectedBeforeSettlement: true } }; }
    try {
      metrics.settlementAttempts++;
      const settlement = await resourceServer.settlePayment(payload, requirement);
      if (!settlement.success || !settlement.transaction || settlement.network !== DEVNET_NETWORK) {
        // Even a failure reply can follow submission: do not assert "no charge".
        return { status: 503, body: { error: 'settlement_uncertain' } };
      }
      return { status: 200, headers: { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement) },
        body: { mode: options.mode, report } };
    } catch {
      return { status: 503, body: { error: 'settlement_uncertain' } };
    }
  };

  app.get('/report', async (req, res) => {
    metrics.requests++;
    res.set('Cache-Control', 'no-store');
    const send = (result: ResponseRecord) => {
      if (result.headers) res.set(result.headers);
      res.status(result.status).json(result.body);
    };
    try {
      const signatureHeader = req.get('PAYMENT-SIGNATURE');
      if (!signatureHeader) { send(await unpaid()); return; }
      if (signatureHeader.length > 32_768) { send(await unpaid('payment_header_too_large')); return; }
      const payload = decodePaymentSignatureHeader(signatureHeader);
      const requirement = payload.accepted
        ? resourceServer.findMatchingRequirements(requirements, payload)
        : undefined;
      const transaction = payload.payload?.transaction;
      if (payload.x402Version !== 2 || !requirement || payload.resource?.url !== url ||
          typeof transaction !== 'string' || !transaction ||
          (payload.accepted.extra?.paymentFlow !== undefined && payload.accepted.extra.paymentFlow !== 'authorization') ||
          payload.accepted.extra?.assetTransferMethod !== undefined) {
        send(await unpaid('quote_mismatch')); return;
      }
      const key = req.get('Idempotency-Key');
      if (!key || !key.trim() || key.length > 200) {
        send({ status: 400, body: { error: 'idempotency_key_required', rejectedBeforeSettlement: true } }); return;
      }
      // Bind both the caller's key and the signed transaction; a new key cannot resettle it.
      const binding = createHash('sha256').update(JSON.stringify([url, terms(requirement), transaction])).digest('hex');
      const existing = byKey.get(key);
      if (existing && existing.binding !== binding) {
        send({ status: 409, body: { error: 'idempotency_conflict' } }); return;
      }
      let operation = existing?.operation ?? byTransaction.get(binding);
      if (operation) metrics.retries++;
      else {
        if (byTransaction.size >= 10_000) {
          send({ status: 503, body: { error: 'prototype_cache_full', rejectedBeforeSettlement: true } }); return;
        }
        // Register the promise before verification/settlement can yield.
        operation = Promise.resolve().then(() => processPayment(payload, requirement));
        byTransaction.set(binding, operation);
      }
      byKey.set(key, { binding, operation });
      send(await operation);
    } catch {
      // A failure sending the final response can occur after settlement. The safe
      // fallback must never claim no charge merely because an exception occurred.
      if (!res.headersSent) send({ status: 503, body: { error: 'payment_processing_uncertain' } });
      else res.end();
    }
  });
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    listening.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo abrir el servidor local.');
  url = `http://127.0.0.1:${address.port}/report`;
  return {
    url, metrics,
    close: async () => { server.closeIdleConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
