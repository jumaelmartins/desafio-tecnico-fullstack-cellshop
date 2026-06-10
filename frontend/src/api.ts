import { ApiErrorBody, Order, Product } from './types';

/**
 * Erro de API "rico": carrega status HTTP, errorCode e details para a UI
 * decidir COMO reagir (e não apenas mostrar uma string genérica).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly traceId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(res: Response): Promise<never> {
  let body: ApiErrorBody | undefined;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // resposta sem JSON (proxy caiu, etc.) — trata como erro técnico
  }
  throw new ApiError(
    res.status,
    body?.error.code ?? 'UNKNOWN_ERROR',
    body?.error.message ?? `Erro inesperado (HTTP ${res.status}).`,
    body?.error.details,
    body?.error.traceId
  );
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch('/api/products');
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { products: Product[] };
  return data.products;
}

export async function createOrder(
  idempotencyKey: string,
  items: Array<{ productId: string; quantity: number }>,
  signal?: AbortSignal
): Promise<{ order: Order; replayed: boolean }> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // A MESMA chave é reaproveitada em retries da mesma compra:
      // é isso que torna o "Reenviar" seguro contra pedido duplicado.
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ items }),
    signal,
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { order: Order; replayed: boolean };
}

export async function fetchOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  const res = await fetch(`/api/orders/${orderId}`, { signal });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { order: Order };
  return data.order;
}
