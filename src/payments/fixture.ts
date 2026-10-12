import { randomUUID } from 'node:crypto';
import { x402Client } from '@x402/core/client';
import type { FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse } from '@x402/core/types';
import { DEVNET_NETWORK } from '../shared/config.ts';

/** TEST DOUBLE ONLY. No signature validation, blockchain, tokens, or real settlement. */
export class FixtureFacilitator implements FacilitatorClient {
  verifications = 0;
  settlements = 0;
  valid = true;
  throwAfterSettlement = false;
  async getSupported(): Promise<SupportedResponse> {
    return { kinds: [{ x402Version: 2, scheme: 'exact', network: DEVNET_NETWORK,
      extra: { feePayer: '11111111111111111111111111111111' } }], extensions: [], signers: {} };
  }
  async verify(payload: PaymentPayload, _requirements: PaymentRequirements): Promise<VerifyResponse> {
    this.verifications++;
    return { isValid: this.valid && payload.payload.transaction?.toString().startsWith('FIXTURE-ONLY:') === true,
      invalidReason: 'fixture_invalid_payment', payer: 'FIXTURE-PAYER' };
  }
  async settle(_payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    this.settlements++;
    if (this.throwAfterSettlement) throw new Error('FIXTURE: response lost after simulated settlement');
    return { success: true, network: DEVNET_NETWORK, amount: requirements.amount,
      transaction: `FIXTURE-ONLY:settlement-${this.settlements}`, payer: 'FIXTURE-PAYER' };
  }
}

/** Real x402 client orchestration with a synthetic scheme signer. Never use outside local tests. */
export function fixtureClient() {
  return x402Client.fromConfig({
    // The synthetic scheme has no real default-asset table. This exception is
    // confined to the fixture; BuyerGateway still applies its configured budget.
    spendControls: false,
    schemes: [{ network: DEVNET_NETWORK, client: {
      scheme: 'exact',
      createPaymentPayload: async (x402Version: number) => ({
        x402Version, payload: { transaction: `FIXTURE-ONLY:${randomUUID()}` },
      }),
    } }],
  });
}
