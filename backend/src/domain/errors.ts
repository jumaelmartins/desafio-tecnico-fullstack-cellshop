/**
 * Modelo de erros da API.
 *
 * Todo erro de negócio vira um AppError com:
 *  - status HTTP
 *  - code estável (para o front decidir o que fazer)
 *  - message amigável em pt-BR (pode ser exibida ao usuário)
 *  - details estruturado (para o front enriquecer a mensagem)
 *
 * O errorHandler (http/middleware.ts) serializa tudo no envelope:
 *   { "error": { "code", "message", "details", "traceId" } }
 */

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class ProductNotFoundError extends AppError {
  constructor(productId: string) {
    super(404, 'PRODUCT_NOT_FOUND', `Produto não encontrado: ${productId}.`, { productId });
  }
}

export class OrderNotFoundError extends AppError {
  constructor(orderId: string) {
    super(404, 'ORDER_NOT_FOUND', `Pedido não encontrado: ${orderId}.`, { orderId });
  }
}

export class InsufficientStockError extends AppError {
  constructor(productId: string, productName: string, requested: number, available: number) {
    super(
      409,
      'INSUFFICIENT_STOCK',
      available === 0
        ? `"${productName}" está esgotado no momento.`
        : `Estoque insuficiente para "${productName}". Disponível: ${available}.`,
      { productId, requested, available }
    );
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Esta Idempotency-Key já foi usada com um payload diferente. Gere uma nova chave para um novo pedido.'
    );
  }
}
