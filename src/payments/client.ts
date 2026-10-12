import type { x402Client } from '@x402/core/client';
import type { PaymentRequirements } from '@x402/core/types';
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import type { PurchaseRequest, SettlementAdapter } from '../buyer/index.ts';

function matches(quote: PaymentRequirements, request: Readonly<PurchaseRequest>): boolean {
  return quote.scheme === 'exact' && quote.network === request.network &&
    quote.asset === request.mint && quote.payTo === request.payTo &&
    quote.amount === request.amount.toString() &&
    Number.isSafeInteger(quote.maxTimeoutSeconds) && quote.maxTimeoutSeconds > 0 &&
    quote.maxTimeoutSeconds <= 60 &&
    (quote.extra.paymentFlow === undefined || quote.extra.paymentFlow === 'authorization') &&
    quote.extra.assetTransferMethod === undefined;
}

/** No automatic re-signing or retry after sending authorization. HTTP outcomes may be uncertain. */
export function x402PurchaseAdapter(client: x402Client, http: typeof fetch = fetch): SettlementAdapter {
  return async request => {
    let encoded: string;
    try {
      const quoteResponse = await http(request.resource, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
      const header = quoteResponse.headers.get('PAYMENT-REQUIRED');
      if (quoteResponse.status !== 402 || !header) return { status: 'rejected', reason: 'El proveedor no entregó una cotización x402 V2.' };
      const required = decodePaymentRequiredHeader(header);
      if (required.x402Version !== 2 || required.resource.url !== request.resource) {
        return { status: 'rejected', reason: 'La cotización no corresponde al recurso solicitado.' };
      }
      const accepted = required.accepts.filter(quote => matches(quote, request));
      if (!accepted.length) return { status: 'rejected', reason: 'Cotización fuera de la red, moneda, importe o destinatario autorizados.' };
      const payload = await client.createPaymentPayload({ ...required, accepts: [accepted[0]!] });
      if (!matches(payload.accepted, request) || payload.resource?.url !== request.resource) {
        return { status: 'rejected', reason: 'El cliente generó una autorización diferente de la aprobada.' };
      }
      encoded = encodePaymentSignatureHeader(payload);
    } catch (error) {
      // Exact authorization only: creation signs locally; no authorization has been sent.
      return { status: 'rejected', reason: error instanceof Error ? error.message : 'Falló la preparación de la compra.' };
    }

    try {
      const response = await http(request.resource, {
        redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'PAYMENT-SIGNATURE': encoded, 'Idempotency-Key': request.idempotencyKey },
      });
      const header = response.headers.get('PAYMENT-RESPONSE');
      if (header) {
        const settlement = decodePaymentResponseHeader(header);
        if (settlement.success && settlement.transaction && settlement.network === request.network &&
            (settlement.amount === undefined || settlement.amount === request.amount.toString())) {
          let result: unknown;
          try { result = await response.json(); }
          catch { result = { error: 'La compra se liquidó, pero la respuesta del servicio no se pudo leer.' }; }
          return { status: 'confirmed', signature: settlement.transaction, result };
        }
      }
      const body = await response.json() as { rejectedBeforeSettlement?: boolean; error?: string };
      if (!header && body.rejectedBeforeSettlement === true) {
        return { status: 'rejected', reason: body.error ?? 'El proveedor rechazó la compra antes de liquidarla.' };
      }
      return { status: 'uncertain', reason: 'No hay un recibo de liquidación confirmado. Conservar la reserva y conciliar.' };
    } catch {
      return { status: 'uncertain', reason: 'Se perdió la respuesta tras enviar la autorización. No repetir ni liberar el presupuesto automáticamente.' };
    }
  };
}
