import { randomUUID } from 'node:crypto';
import { InsufficientStockError, ProductNotFoundError } from '../domain/errors';
import { Reservation } from '../domain/types';
import { log } from '../lib/logger';
import { MemoryStore } from '../store/memory';

const DEFAULT_RESERVATION_TTL_MS = 2 * 60_000; // 2 min (curto, para facilitar a demo)

/**
 * Estoque com modelo de RESERVA:
 *
 *  reserve() → check-and-decrement do estoque disponível + reserva HELD
 *  commit()  → a venda foi confirmada no ERP; o decremento vira definitivo
 *  release() → devolve a quantidade ao estoque (falha terminal ou expiração)
 *
 * POR QUE NÃO HÁ OVERSELL AQUI:
 * Os métodos são 100% síncronos (nenhum await). Como o Node executa JS em
 * uma única thread, duas requisições "simultâneas" nunca intercalam dentro
 * de reserve(): o check (stock >= qty) e o decremento acontecem como uma
 * operação atômica do ponto de vista do event loop.
 *
 * Em produção (multi-instância) o equivalente seria:
 *   UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q
 * (decremento condicional no banco) ou um script Lua no Redis — a mesma
 * semântica, só que atômica no storage compartilhado.
 */
export class InventoryService {
  constructor(
    private readonly store: MemoryStore,
    private readonly reservationTtlMs: number = DEFAULT_RESERVATION_TTL_MS
  ) {}

  reserve(productId: string, quantity: number, orderId: string): Reservation {
    const product = this.store.products.get(productId);
    if (!product) throw new ProductNotFoundError(productId);
    if (product.stock < quantity) {
      throw new InsufficientStockError(product.id, product.name, quantity, product.stock);
    }

    product.stock -= quantity;
    const reservation: Reservation = {
      id: randomUUID(),
      orderId,
      productId,
      quantity,
      state: 'HELD',
      expiresAt: Date.now() + this.reservationTtlMs,
    };
    this.store.reservations.set(reservation.id, reservation);
    return reservation;
  }

  release(reservationId: string): void {
    const reservation = this.store.reservations.get(reservationId);
    if (!reservation || reservation.state !== 'HELD') return; // idempotente
    reservation.state = 'RELEASED';
    const product = this.store.products.get(reservation.productId);
    if (product) product.stock += reservation.quantity;
  }

  commit(reservationId: string): void {
    const reservation = this.store.reservations.get(reservationId);
    if (!reservation || reservation.state !== 'HELD') return; // idempotente
    reservation.state = 'COMMITTED';
  }

  commitByOrder(orderId: string): void {
    for (const r of this.store.reservations.values()) {
      if (r.orderId === orderId) this.commit(r.id);
    }
  }

  releaseByOrder(orderId: string): void {
    for (const r of this.store.reservations.values()) {
      if (r.orderId === orderId) this.release(r.id);
    }
  }

  /**
   * Libera reservas HELD expiradas. Cobre o caso patológico de um worker
   * morrer no meio do processamento: o estoque não fica preso para sempre.
   * Chamado periodicamente em src/index.ts.
   */
  sweepExpired(now: number = Date.now()): number {
    let released = 0;
    for (const r of this.store.reservations.values()) {
      if (r.state === 'HELD' && r.expiresAt <= now) {
        this.release(r.id);
        released += 1;
        log.warn('reservation_expired', { reservationId: r.id, orderId: r.orderId });
      }
    }
    return released;
  }
}
