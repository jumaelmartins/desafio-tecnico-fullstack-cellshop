import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from '../domain/errors';
import { log } from '../lib/logger';

declare module 'express-serve-static-core' {
  interface Request {
    traceId?: string;
  }
}

/** Toda requisição ganha um traceId, devolvido em X-Trace-Id e logado. */
export function traceId(req: Request, res: Response, next: NextFunction): void {
  req.traceId = randomUUID();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
}

/** CORS simples — permite rodar o front fora do proxy do Vite, se necessário. */
export function cors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

/** Loga método, rota, status e duração de cada requisição. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    log.info('http_request', {
      traceId: req.traceId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
}

/**
 * Tradutor central de erros → envelope único:
 *   { "error": { "code", "message", "details", "traceId" } }
 * O front decide o que fazer pelo `code`, nunca por parsing de mensagem.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // JSON malformado vindo do express.json()
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Corpo da requisição não é um JSON válido.',
        details: {},
        traceId: req.traceId,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    log.warn('request_error', {
      traceId: req.traceId,
      code: err.code,
      status: err.status,
      message: err.message,
    });
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, traceId: req.traceId },
    });
    return;
  }

  log.error('unhandled_error', {
    traceId: req.traceId,
    error: err instanceof Error ? err.stack : String(err),
  });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno inesperado. Tente novamente em instantes.',
      details: {},
      traceId: req.traceId,
    },
  });
}
