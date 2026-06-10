import { createHash } from 'node:crypto';
import { CheckoutInput } from '../domain/types';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hash estável do payload de checkout, usado para detectar reuso de
 * Idempotency-Key com corpo diferente (IDEMPOTENCY_CONFLICT).
 * Ordena os itens por productId para que a ordem do array não importe.
 */
export function checkoutPayloadHash(input: CheckoutInput): string {
  const canonical = {
    items: input.items
      .map((i) => ({ productId: i.productId, quantity: i.quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
