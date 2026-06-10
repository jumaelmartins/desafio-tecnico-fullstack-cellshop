import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { FakeErp, waitForStatus } from './helpers';

/**
 * Testes de concorrência (bônus do desafio).
 *
 * A garantia central é: a reserva de estoque é uma seção crítica 100% síncrona
 * dentro do event loop do Node, então mesmo N requisições "simultâneas" são
 * serializadas no ponto de check-and-decrement — nunca há oversell.
 */
const FAST = { maxAttempts: 3, backoffBaseMs: 1 };

function post(app: any, key: string, productId: string, quantity = 1) {
  return request(app)
    .post('/api/orders')
    .set('Idempotency-Key', key)
    .send({ items: [{ productId, quantity }] });
}

describe('concorrência no checkout', () => {
  it('última unidade: 8 clientes simultâneos, exatamente 1 compra aceita', async () => {
    const { app, container } = createApp({ erp: new FakeErp('always-ok'), processorOptions: FAST });

    // case-003 nasce com estoque 1 (o seed foi pensado para este cenário).
    expect(container.store.products.get('case-003')!.stock).toBe(1);

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => post(app, `corrida-ultima-${i}`, 'case-003'))
    );

    const accepted = responses.filter((r) => r.status === 202);
    const rejected = responses.filter((r) => r.status === 409);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    for (const r of rejected) {
      expect(r.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(r.body.error.details).toMatchObject({ productId: 'case-003', available: 0 });
    }

    // O vencedor confirma no ERP e o estoque termina em 0 — nem negativo, nem "ressuscitado".
    const orderId = accepted[0].body.order.id as string;
    const final = await waitForStatus(() => container.store.orders.get(orderId), ['CONFIRMED']);
    expect(final.status).toBe('CONFIRMED');
    expect(container.store.products.get('case-003')!.stock).toBe(0);
  });

  it('estoque 5 x 20 clientes: aceita exatamente 5 e nunca vende a mais', async () => {
    const { app, container } = createApp({ erp: new FakeErp('always-ok'), processorOptions: FAST });

    expect(container.store.products.get('case-002')!.stock).toBe(5);

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => post(app, `corrida-lote-${i}`, 'case-002'))
    );

    const accepted = responses.filter((r) => r.status === 202);
    expect(accepted).toHaveLength(5);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(15);

    // Todos os 5 pedidos aceitos terminam CONFIRMED e o estoque fecha em 0.
    for (const r of accepted) {
      const id = r.body.order.id as string;
      await waitForStatus(() => container.store.orders.get(id), ['CONFIRMED']);
    }
    expect(container.store.products.get('case-002')!.stock).toBe(0);
  });

  it('rajada com a MESMA Idempotency-Key cria um único pedido (duplo clique extremo)', async () => {
    const { app, container } = createApp({ erp: new FakeErp('always-ok'), processorOptions: FAST });

    const before = container.store.products.get('case-001')!.stock;

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => post(app, 'mesma-chave-rajada', 'case-001', 1))
    );

    // Todas as respostas são 202 e apontam para o MESMO pedido.
    const ids = new Set(responses.map((r) => r.body.order.id));
    expect(responses.every((r) => r.status === 202)).toBe(true);
    expect(ids.size).toBe(1);
    expect(container.store.orders.size).toBe(1);

    // Estoque debitado uma única vez.
    await waitForStatus(() => container.store.orders.get([...ids][0] as string), ['CONFIRMED']);
    expect(container.store.products.get('case-001')!.stock).toBe(before - 1);
  });
});
