import { Order, OrderStatus } from '../src/domain/types';
import { ErpGateway, ErpTransientError } from '../src/services/erp';
import { sleep } from '../src/lib/util';

export type ErpPlan = 'always-ok' | 'always-fail' | Array<'ok' | 'fail'>;

/**
 * ERP determinístico para testes: o "plan" define o resultado de cada
 * chamada na ordem ('fail', 'fail', 'ok' → falha 2x e confirma na 3ª).
 */
export class FakeErp implements ErpGateway {
  calls = 0;

  constructor(private readonly plan: ErpPlan = 'always-ok', private readonly delayMs = 0) {}

  async submitOrder(_order: Order): Promise<{ erpOrderId: string }> {
    this.calls += 1;
    if (this.delayMs > 0) await sleep(this.delayMs);

    const verdict =
      this.plan === 'always-ok'
        ? 'ok'
        : this.plan === 'always-fail'
          ? 'fail'
          : (this.plan[this.calls - 1] ?? 'ok');

    if (verdict === 'fail') throw new ErpTransientError('falha transitória simulada (teste)');
    return { erpOrderId: `ERP-FAKE-${this.calls}` };
  }
}

/** Aguarda o pedido atingir um status terminal (polling de 10ms). */
export async function waitForStatus(
  getOrder: () => Order | undefined,
  expected: OrderStatus[],
  timeoutMs = 4000
): Promise<Order> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const order = getOrder();
    if (order && expected.includes(order.status)) return order;
    await sleep(10);
  }
  throw new Error(
    `Timeout aguardando status ${expected.join('/')}; atual: ${getOrder()?.status ?? 'indefinido'}`
  );
}
