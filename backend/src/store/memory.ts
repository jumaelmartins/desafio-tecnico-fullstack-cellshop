import { Order, Product, Reservation } from '../domain/types';

export interface IdempotencyRecord {
  orderId: string;
  payloadHash: string;
}

/**
 * "Banco" em memória da loja.
 *
 * Trade-off assumido (documentado no README): em memória simplifica a
 * avaliação e zera dependências. Em produção, products/orders/reservations
 * viveriam no banco próprio da loja (Postgres) e idempotency em
 * Redis/tabela com TTL. As interfaces dos services já isolam essa troca.
 */
export class MemoryStore {
  readonly products = new Map<string, Product>();
  readonly orders = new Map<string, Order>();
  readonly reservations = new Map<string, Reservation>();
  readonly idempotency = new Map<string, IdempotencyRecord>();
}

const SEED: Product[] = [
  {
    id: 'case-001',
    name: 'Capinha Silicone Soft',
    description: 'Toque aveludado, proteção 360° · iPhone 15',
    priceCents: 4990,
    stock: 12,
    emoji: '🫧',
    caseColor: '#A78BFA',
  },
  {
    id: 'case-002',
    name: 'Capinha Anti-Impacto Clear',
    description: 'Transparente, bordas reforçadas · Galaxy S24',
    priceCents: 3990,
    stock: 5,
    emoji: '🛡️',
    caseColor: '#7DD3FC',
  },
  {
    id: 'case-003',
    name: 'Capinha Couro Premium',
    description: 'Couro legítimo, fecho magnético · iPhone 15 Pro',
    priceCents: 12990,
    stock: 1,
    emoji: '✨',
    caseColor: '#B45309',
  },
  {
    id: 'case-004',
    name: 'Capinha MagSafe Color',
    description: 'Compatível com MagSafe, 6 cores · iPhone 14/15',
    priceCents: 8990,
    stock: 8,
    emoji: '🧲',
    caseColor: '#34D399',
  },
  {
    id: 'case-005',
    name: 'Capinha Tropical Bahia',
    description: 'Estampa exclusiva, edição limitada',
    priceCents: 5990,
    stock: 0,
    emoji: '🌴',
    caseColor: '#FB7185',
  },
  {
    id: 'case-006',
    name: 'Capinha com Cordão',
    description: 'Alça ajustável para levar a tiracolo',
    priceCents: 3490,
    stock: 20,
    emoji: '🪢',
    caseColor: '#FACC15',
  },
];

export function seedProducts(store: MemoryStore): void {
  for (const product of SEED) {
    // Clona para que cada instância de app/teste tenha estoque independente.
    store.products.set(product.id, { ...product });
  }
}
