import { ErpGateway, ErpTransientError } from './erp';
import { InventoryService } from './inventory';
import { log } from '../lib/logger';
import { sleep } from '../lib/util';
import { MemoryStore } from '../store/memory';

export interface ProcessorOptions {
  maxAttempts?: number;
  backoffBaseMs?: number;
}

/**
 * Processa pedidos FORA do ciclo da requisição HTTP — é o que resolve o
 * problema 3 do case (timeout no checkout): a API aceita o pedido em
 * milissegundos (202) e este worker conversa com o ERP lento por trás.
 *
 * Política: até maxAttempts tentativas com backoff exponencial
 * (base * 2^n). Sucesso → CONFIRMED + commit das reservas.
 * Esgotou/erro não-transitório → FAILED + release das reservas
 * (o estoque volta para a vitrine).
 *
 * Aqui é uma fila em processo (setImmediate). Em produção seria uma fila
 * real (SQS/RabbitMQ) com DLQ — a interface schedule() não mudaria.
 */
export class OrderProcessor {
  constructor(
    private readonly store: MemoryStore,
    private readonly inventory: InventoryService,
    private readonly erp: ErpGateway,
    private readonly options: ProcessorOptions = {}
  ) {}

  get maxAttempts(): number {
    return this.options.maxAttempts ?? 4;
  }

  schedule(orderId: string): void {
    setImmediate(() => {
      this.process(orderId).catch((err) =>
        log.error('order_processor_crash', { orderId, error: String(err) })
      );
    });
  }

  async process(orderId: string): Promise<void> {
    const order = this.store.orders.get(orderId);
    if (!order || order.status !== 'PROCESSING') return;

    const backoffBase = this.options.backoffBaseMs ?? 500;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      order.attempts = attempt;
      order.updatedAt = new Date().toISOString();
      try {
        log.info('erp_submit_attempt', { orderId, attempt, maxAttempts: this.maxAttempts });
        const { erpOrderId } = await this.erp.submitOrder(order);

        order.erpOrderId = erpOrderId;
        order.status = 'CONFIRMED';
        order.lastError = undefined;
        order.updatedAt = new Date().toISOString();
        this.inventory.commitByOrder(orderId);
        log.info('order_confirmed', { orderId, erpOrderId, attempts: attempt });
        return;
      } catch (err) {
        const transient = err instanceof ErpTransientError;
        order.lastError = err instanceof Error ? err.message : String(err);
        order.updatedAt = new Date().toISOString();
        log.warn('erp_submit_failed', { orderId, attempt, transient, error: order.lastError });

        if (!transient || attempt === this.maxAttempts) break;
        await sleep(backoffBase * 2 ** (attempt - 1));
      }
    }

    order.status = 'FAILED';
    order.updatedAt = new Date().toISOString();
    this.inventory.releaseByOrder(orderId);
    log.warn('order_failed_stock_released', { orderId, attempts: order.attempts });
  }
}
