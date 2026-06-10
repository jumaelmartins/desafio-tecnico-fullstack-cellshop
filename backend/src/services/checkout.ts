import { randomUUID } from 'node:crypto';
import { IdempotencyConflictError, ProductNotFoundError } from '../domain/errors';
import { CheckoutInput, Order, OrderItem, Reservation } from '../domain/types';
import { log } from '../lib/logger';
import { checkoutPayloadHash } from '../lib/util';
import { MemoryStore } from '../store/memory';
import { InventoryService } from './inventory';
import { OrderProcessor } from './orderProcessor';

export interface CheckoutResult {
  order: Order;
  /** true quando a resposta é replay idempotente de um pedido já aceito. */
  replayed: boolean;
}

export class CheckoutService {
  constructor(
    private readonly store: MemoryStore,
    private readonly inventory: InventoryService,
    private readonly processor: OrderProcessor
  ) {}

  /**
   * SEÇÃO CRÍTICA DELIBERADAMENTE SÍNCRONA (nenhum await até o final):
   * checar idempotência → reservar estoque → criar pedido → registrar a chave
   * acontece como um bloco atômico no event loop. Assim, nem rajadas
   * paralelas com a MESMA chave criam dois pedidos, nem duas compras da
   * última unidade passam juntas (ver tests/concurrency.test.ts).
   *
   * Em produção multi-instância, a mesma garantia viria de um UNIQUE
   * constraint na chave de idempotência + decremento condicional no banco,
   * dentro de uma transação.
   */
  createOrder(idempotencyKey: string, input: CheckoutInput): CheckoutResult {
    const payloadHash = checkoutPayloadHash(input);

    // 1) Idempotência: mesma chave + mesmo payload ⇒ devolve o MESMO pedido.
    const existing = this.store.idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new IdempotencyConflictError();
      const order = this.store.orders.get(existing.orderId)!;
      log.info('checkout_idempotent_replay', { orderId: order.id, idempotencyKey });
      return { order, replayed: true };
    }

    // 2) Reserva de estoque item a item, com rollback se algum falhar.
    const orderId = randomUUID();
    const reserved: Reservation[] = [];
    const items: OrderItem[] = [];
    try {
      for (const item of input.items) {
        const product = this.store.products.get(item.productId);
        if (!product) throw new ProductNotFoundError(item.productId);
        reserved.push(this.inventory.reserve(product.id, item.quantity, orderId));
        items.push({
          productId: product.id,
          name: product.name,
          unitPriceCents: product.priceCents, // preço SEMPRE do servidor
          quantity: item.quantity,
        });
      }
    } catch (err) {
      for (const r of reserved) this.inventory.release(r.id);
      throw err;
    }

    // 3) Pedido aceito (PROCESSING) + registro da chave de idempotência.
    const now = new Date().toISOString();
    const order: Order = {
      id: orderId,
      status: 'PROCESSING',
      items,
      totalCents: items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
      idempotencyKey,
      attempts: 0,
      maxAttempts: this.processor.maxAttempts,
      createdAt: now,
      updatedAt: now,
    };
    this.store.orders.set(order.id, order);
    this.store.idempotency.set(idempotencyKey, { orderId: order.id, payloadHash });
    log.info('checkout_accepted', {
      orderId: order.id,
      idempotencyKey,
      totalCents: order.totalCents,
    });

    // 4) Integração com o ERP fica para o worker, fora desta requisição.
    this.processor.schedule(order.id);

    return { order, replayed: false };
  }
}
