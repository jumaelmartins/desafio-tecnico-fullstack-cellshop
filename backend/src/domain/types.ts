/**
 * Tipos de domínio da loja.
 *
 * Decisão: preços em centavos (inteiros) para evitar erro de ponto flutuante.
 * O preço NUNCA vem do cliente — é sempre lido do catálogo no servidor.
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  /** Estoque disponível para venda (já desconta reservas ativas). */
  stock: number;
  emoji: string;
  caseColor: string;
}

export type OrderStatus = 'PROCESSING' | 'CONFIRMED' | 'FAILED';

export interface OrderItem {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  items: OrderItem[];
  totalCents: number;
  idempotencyKey: string;
  /** Tentativas de integração com o ERP já realizadas. */
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  erpOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReservationState = 'HELD' | 'COMMITTED' | 'RELEASED';

export interface Reservation {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  state: ReservationState;
  /** Epoch ms. Reservas HELD além disso são liberadas pelo sweeper. */
  expiresAt: number;
}

export interface CheckoutInput {
  items: Array<{ productId: string; quantity: number }>;
}
