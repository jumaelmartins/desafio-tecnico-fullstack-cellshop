import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, createOrder, fetchOrder } from './api';
import { Order } from './types';

/**
 * Estados possíveis de UMA tentativa de compra. A UI renderiza cada um de
 * forma diferente — esse é o "mapa" pedido na Pergunta 4 do desafio.
 */
export type CheckoutState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'polling'; order: Order }
  | { phase: 'success'; order: Order; replayed: boolean }
  | { phase: 'failed'; order: Order } // ERP esgotou as tentativas
  | { phase: 'insufficient'; message: string; available: number | null }
  | { phase: 'invalid'; message: string }
  | { phase: 'network'; message: string }; // seguro reenviar com a MESMA chave

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_POLL_FAILURES = 5;

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseCheckoutOptions {
  /** Intervalo do polling de status (ms). Reduzido nos testes. */
  pollIntervalMs?: number;
  /** Chamado quando a tentativa chega a um estado terminal (para recarregar estoque na vitrine). */
  onSettled?: () => void;
}

/**
 * Hook de checkout POR PRODUTO.
 *
 * Regra de ouro da idempotência no cliente:
 *  - erro de REDE/TIMEOUT  → mantém a MESMA Idempotency-Key e o MESMO payload;
 *    "Reenviar" nunca duplica o pedido (o servidor faz replay).
 *  - estado TERMINAL (sucesso, validação, estoque, FAILED) → a próxima compra
 *    é outra intenção, então a chave é ROTACIONADA.
 */
export function useCheckout(productId: string, options: UseCheckoutOptions = {}) {
  const { pollIntervalMs = 800, onSettled } = options;
  const [state, setState] = useState<CheckoutState>({ phase: 'idle' });

  const keyRef = useRef<string>(newIdempotencyKey());
  const payloadRef = useRef<Array<{ productId: string; quantity: number }>>([]);
  // Invalida submissões/pollings antigos quando uma nova tentativa começa
  // ou quando o componente desmonta.
  const generationRef = useRef(0);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    return () => {
      generationRef.current += 1; // cancela loops pendentes no unmount
    };
  }, []);

  const settle = useCallback((next: CheckoutState) => {
    setState(next);
    onSettledRef.current?.();
  }, []);

  const poll = useCallback(
    async (orderId: string, generation: number) => {
      let consecutiveFailures = 0;
      while (generationRef.current === generation) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        if (generationRef.current !== generation) return;
        try {
          const order = await fetchOrder(orderId);
          consecutiveFailures = 0;
          if (generationRef.current !== generation) return;
          if (order.status === 'CONFIRMED') {
            keyRef.current = newIdempotencyKey();
            settle({ phase: 'success', order, replayed: false });
            return;
          }
          if (order.status === 'FAILED') {
            keyRef.current = newIdempotencyKey();
            settle({ phase: 'failed', order });
            return;
          }
          setState({ phase: 'polling', order }); // atualiza "tentativa X de Y"
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_POLL_FAILURES) {
            // O pedido FOI aceito; só perdemos o acompanhamento. Reenviar com a
            // mesma chave é seguro: o replay devolve o mesmo pedido.
            setState({
              phase: 'network',
              message:
                'Perdemos a conexão enquanto acompanhávamos seu pedido. Reenviar é seguro — não haverá cobrança duplicada.',
            });
            return;
          }
        }
      }
    },
    [pollIntervalMs, settle]
  );

  const submit = useCallback(
    async (quantity: number) => {
      // Anti duplo clique (2ª camada — o botão já fica desabilitado na UI).
      if (state.phase === 'submitting' || state.phase === 'polling') return;

      const resending = state.phase === 'network';
      if (!resending) {
        // Nova intenção de compra → novo payload. A chave atual (rotacionada no
        // último estado terminal, ou recém-criada) identifica ESTA intenção.
        payloadRef.current = [{ productId, quantity }];
      }

      const generation = ++generationRef.current;
      setState({ phase: 'submitting' });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const { order, replayed } = await createOrder(
          keyRef.current,
          payloadRef.current,
          controller.signal
        );
        if (generationRef.current !== generation) return;

        if (order.status === 'CONFIRMED') {
          keyRef.current = newIdempotencyKey();
          settle({ phase: 'success', order, replayed });
          return;
        }
        if (order.status === 'FAILED') {
          keyRef.current = newIdempotencyKey();
          settle({ phase: 'failed', order });
          return;
        }
        setState({ phase: 'polling', order });
        void poll(order.id, generation);
      } catch (err) {
        if (generationRef.current !== generation) return;

        if (err instanceof ApiError) {
          // Estados TERMINAIS → rotaciona a chave (a próxima compra é outra intenção).
          if (err.code === 'INSUFFICIENT_STOCK') {
            keyRef.current = newIdempotencyKey();
            settle({
              phase: 'insufficient',
              message: err.message,
              available: typeof err.details?.available === 'number' ? err.details.available : null,
            });
            return;
          }
          if (err.status === 400 || err.code === 'PRODUCT_NOT_FOUND') {
            keyRef.current = newIdempotencyKey();
            settle({ phase: 'invalid', message: err.message });
            return;
          }
          if (err.code === 'IDEMPOTENCY_CONFLICT') {
            // Defesa em profundidade: não deveria acontecer com este fluxo de chaves.
            keyRef.current = newIdempotencyKey();
            settle({
              phase: 'invalid',
              message: 'Detectamos um conflito na tentativa anterior. Pode tentar de novo.',
            });
            return;
          }
        }
        // Timeout/abort, queda de rede, 5xx → NÃO rotaciona a chave.
        setState({
          phase: 'network',
          message:
            'Não conseguimos confirmar o envio do pedido. Reenviar é seguro — usamos a mesma chave e o pedido não será duplicado.',
        });
      } finally {
        clearTimeout(timeout);
      }
    },
    [poll, productId, settle, state.phase]
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    setState({ phase: 'idle' });
  }, []);

  const busy = state.phase === 'submitting' || state.phase === 'polling';
  return { state, submit, reset, busy };
}
