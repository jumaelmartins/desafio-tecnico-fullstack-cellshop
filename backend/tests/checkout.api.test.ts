import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FakeErp, waitForStatus } from './helpers';

const FAST = { maxAttempts: 3, backoffBaseMs: 1 };

function buildApp(erp = new FakeErp('always-ok')) {
  return { erp, ...createApp({ erp, processorOptions: FAST }) };
}

describe('API /api/products', () => {
  it('lista o catálogo com estoque', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.products[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      priceCents: expect.any(Number),
      stock: expect.any(Number),
    });
  });
});

describe('POST /api/orders — contrato e fluxo feliz', () => {
  it('aceita o pedido (202 PROCESSING) e confirma de forma assíncrona', async () => {
    const { app, container } = buildApp();
    const stockBefore = container.store.products.get('case-001')!.stock;

    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-happy-1')
      .send({ items: [{ productId: 'case-001', quantity: 2 }] });

    expect(res.status).toBe(202);
    expect(res.body.replayed).toBe(false);
    expect(res.body.order).toMatchObject({
      status: 'PROCESSING',
      totalCents: 2 * 4990,
    });

    // Estoque já foi reservado na aceitação — antes da confirmação do ERP.
    expect(container.store.products.get('case-001')!.stock).toBe(stockBefore - 2);

    const order = await waitForStatus(
      () => container.store.orders.get(res.body.order.id),
      ['CONFIRMED']
    );
    expect(order.erpOrderId).toMatch(/^ERP-FAKE-/);
    expect(order.attempts).toBe(1);

    const statusRes = await request(app).get(`/api/orders/${order.id}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.order.status).toBe('CONFIRMED');
  });
});

describe('POST /api/orders — validação', () => {
  it('exige o header Idempotency-Key', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [{ productId: 'case-001', quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.traceId).toBeTruthy();
  });

  it('rejeita quantidade inválida com a lista de issues', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-invalid-qty')
      .send({ items: [{ productId: 'case-001', quantity: 0 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'items.0.quantity' })])
    );
  });

  it('rejeita JSON malformado', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-bad-json')
      .set('Content-Type', 'application/json')
      .send('{isso não é json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // O traceId precisa estar presente mesmo quando o erro vem do parser de
    // corpo (regressão: o middleware traceId deve rodar ANTES do express.json()).
    expect(res.body.error.traceId).toBeTruthy();
    expect(res.headers['x-trace-id']).toBeTruthy();
  });

  it('retorna 404 PRODUCT_NOT_FOUND para produto inexistente', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-missing-product')
      .send({ items: [{ productId: 'case-999', quantity: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('POST /api/orders — estoque insuficiente', () => {
  it('retorna 409 INSUFFICIENT_STOCK com requested/available e não cria pedido', async () => {
    const { app, container } = buildApp();
    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-no-stock')
      .send({ items: [{ productId: 'case-002', quantity: 99 }] }); // seed: 5

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toMatchObject({
      productId: 'case-002',
      requested: 99,
      available: 5,
    });
    expect(container.store.orders.size).toBe(0);
    expect(container.store.products.get('case-002')!.stock).toBe(5); // nada ficou retido
  });
});

describe('POST /api/orders — idempotência', () => {
  it('mesma chave + mesmo payload devolve o MESMO pedido e reserva uma única vez', async () => {
    const { app, container } = buildApp();
    const payload = { items: [{ productId: 'case-004', quantity: 1 }] };
    const stockBefore = container.store.products.get('case-004')!.stock;

    const first = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-dup')
      .send(payload);
    const second = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-dup')
      .send(payload);

    expect(second.status).toBe(202);
    expect(second.body.replayed).toBe(true);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(container.store.orders.size).toBe(1);
    expect(container.store.products.get('case-004')!.stock).toBe(stockBefore - 1);
  });

  it('mesma chave + payload diferente retorna 409 IDEMPOTENCY_CONFLICT', async () => {
    const { app } = buildApp();

    await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-conflict')
      .send({ items: [{ productId: 'case-004', quantity: 1 }] });

    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-conflict')
      .send({ items: [{ productId: 'case-004', quantity: 3 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('Resiliência na integração com o ERP', () => {
  it('confirma após falhas transitórias, registrando as tentativas', async () => {
    const erp = new FakeErp(['fail', 'fail', 'ok']);
    const { app, container } = createApp({ erp, processorOptions: FAST });

    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-retry')
      .send({ items: [{ productId: 'case-006', quantity: 1 }] });

    const order = await waitForStatus(
      () => container.store.orders.get(res.body.order.id),
      ['CONFIRMED', 'FAILED']
    );

    expect(order.status).toBe('CONFIRMED');
    expect(order.attempts).toBe(3);
    expect(erp.calls).toBe(3);
  });

  it('marca FAILED após esgotar as tentativas e DEVOLVE o estoque', async () => {
    const erp = new FakeErp('always-fail');
    const { app, container } = createApp({ erp, processorOptions: FAST });
    const stockBefore = container.store.products.get('case-006')!.stock;

    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-erp-down')
      .send({ items: [{ productId: 'case-006', quantity: 2 }] });

    expect(res.status).toBe(202); // a aceitação não depende do ERP

    const order = await waitForStatus(
      () => container.store.orders.get(res.body.order.id),
      ['CONFIRMED', 'FAILED']
    );

    expect(order.status).toBe('FAILED');
    expect(order.attempts).toBe(FAST.maxAttempts);
    expect(order.lastError).toContain('falha transitória');
    expect(container.store.products.get('case-006')!.stock).toBe(stockBefore);
  });
});
