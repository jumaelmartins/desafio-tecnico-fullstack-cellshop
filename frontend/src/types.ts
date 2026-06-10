// Tipos espelhados do contrato do backend.
// Próximo passo natural (documentado no README): extrair para um pacote
// compartilhado ou gerar a partir de OpenAPI para virar teste de contrato.

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  emoji: string;
  caseColor: string;
}

export type OrderStatus = 'PROCESSING' | 'CONFIRMED' | 'FAILED';

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  items: OrderItem[];
  totalCents: number;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  erpOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId?: string;
  };
}
