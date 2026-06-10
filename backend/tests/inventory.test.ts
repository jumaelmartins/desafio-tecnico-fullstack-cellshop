import { beforeEach, describe, expect, it } from 'vitest';
import { InsufficientStockError, ProductNotFoundError } from '../src/domain/errors';
import { InventoryService } from '../src/services/inventory';
import { MemoryStore, seedProducts } from '../src/store/memory';

describe('InventoryService', () => {
  let store: MemoryStore;
  let inventory: InventoryService;

  beforeEach(() => {
    store = new MemoryStore();
    seedProducts(store);
    inventory = new InventoryService(store, 60_000);
  });

  it('reserva decrementa o estoque disponível imediatamente', () => {
    const before = store.products.get('case-001')!.stock;
    const reservation = inventory.reserve('case-001', 3, 'order-1');

    expect(reservation.state).toBe('HELD');
    expect(store.products.get('case-001')!.stock).toBe(before - 3);
  });

  it('lança InsufficientStockError com detalhes quando não há estoque', () => {
    try {
      inventory.reserve('case-002', 999, 'order-1'); // estoque seed: 5
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientStockError);
      const e = err as InsufficientStockError;
      expect(e.code).toBe('INSUFFICIENT_STOCK');
      expect(e.details).toMatchObject({ productId: 'case-002', requested: 999, available: 5 });
    }
  });

  it('lança ProductNotFoundError para produto inexistente', () => {
    expect(() => inventory.reserve('nao-existe', 1, 'order-1')).toThrow(ProductNotFoundError);
  });

  it('release devolve o estoque e é idempotente', () => {
    const before = store.products.get('case-001')!.stock;
    const r = inventory.reserve('case-001', 2, 'order-1');

    inventory.release(r.id);
    inventory.release(r.id); // segunda chamada não pode devolver de novo

    expect(store.products.get('case-001')!.stock).toBe(before);
    expect(store.reservations.get(r.id)!.state).toBe('RELEASED');
  });

  it('commit torna o decremento definitivo (release posterior não devolve)', () => {
    const before = store.products.get('case-001')!.stock;
    const r = inventory.reserve('case-001', 2, 'order-1');

    inventory.commit(r.id);
    inventory.release(r.id); // não tem efeito sobre reserva COMMITTED

    expect(store.products.get('case-001')!.stock).toBe(before - 2);
    expect(store.reservations.get(r.id)!.state).toBe('COMMITTED');
  });

  it('sweepExpired libera apenas reservas HELD vencidas', () => {
    const inventoryShortTtl = new InventoryService(store, 50);
    const before = store.products.get('case-006')!.stock;

    const expired = inventoryShortTtl.reserve('case-006', 4, 'order-old');
    const committed = inventoryShortTtl.reserve('case-006', 1, 'order-paid');
    inventoryShortTtl.commit(committed.id);

    const released = inventoryShortTtl.sweepExpired(Date.now() + 60_000);

    expect(released).toBe(1);
    expect(store.reservations.get(expired.id)!.state).toBe('RELEASED');
    expect(store.products.get('case-006')!.stock).toBe(before - 1); // só o COMMITTED segue baixado
  });

  it('nunca vende além do estoque em reservas sucessivas', () => {
    // case-002 tem 5 unidades: 5 reservas de 1 passam, a 6ª falha.
    for (let i = 0; i < 5; i += 1) {
      inventory.reserve('case-002', 1, `order-${i}`);
    }
    expect(() => inventory.reserve('case-002', 1, 'order-extra')).toThrow(InsufficientStockError);
    expect(store.products.get('case-002')!.stock).toBe(0);
  });
});
