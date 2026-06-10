import { useState } from 'react';
import { CheckoutState, useCheckout } from '../useCheckout';
import { Product } from '../types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatCents = (cents: number) => brl.format(cents / 100);

function StatusPanel({ state, onRetry }: { state: CheckoutState; onRetry: () => void }) {
  switch (state.phase) {
    case 'success':
      return (
        <div className="status status--success" role="status">
          <strong>Compra confirmada! 🎉</strong>
          <span>
            Pedido <code>{state.order.id.slice(0, 8)}</code> · {formatCents(state.order.totalCents)}
            {state.order.erpOrderId ? ` · ERP ${state.order.erpOrderId}` : ''}
          </span>
        </div>
      );
    case 'insufficient':
      return (
        <div className="status status--warn" role="alert">
          <strong>Estoque insuficiente</strong>
          <span>
            {state.available !== null && state.available > 0
              ? `Restam apenas ${state.available} unidade(s). Ajuste a quantidade e tente de novo.`
              : 'Esse modelo acabou de esgotar. 😢'}
          </span>
        </div>
      );
    case 'invalid':
      return (
        <div className="status status--warn" role="alert">
          <strong>Não foi possível enviar</strong>
          <span>{state.message}</span>
        </div>
      );
    case 'failed':
      return (
        <div className="status status--error" role="alert">
          <strong>O ERP não confirmou o pedido</strong>
          <span>
            Tentamos {state.order.attempts}x sem sucesso
            {state.order.lastError ? ` (${state.order.lastError})` : ''}. Nada foi cobrado e o
            estoque foi devolvido.
          </span>
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      );
    case 'network':
      return (
        <div className="status status--error" role="alert">
          <strong>Falha de conexão</strong>
          <span>{state.message}</span>
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            Reenviar com segurança
          </button>
        </div>
      );
    default:
      return null;
  }
}

export function ProductCard({
  product,
  onSettled,
  pollIntervalMs,
}: {
  product: Product;
  onSettled: () => void;
  pollIntervalMs?: number;
}) {
  const [quantity, setQuantity] = useState(1);
  const { state, submit, busy } = useCheckout(product.id, { onSettled, pollIntervalMs });

  const soldOut = product.stock === 0;
  const disabled = busy || soldOut;

  const buttonLabel =
    state.phase === 'submitting'
      ? 'Enviando pedido…'
      : state.phase === 'polling'
        ? `Processando no ERP (${Math.max(state.order.attempts, 1)}/${state.order.maxAttempts})…`
        : state.phase === 'network'
          ? 'Reenviar com segurança'
          : 'Comprar';

  return (
    <article className={`card${soldOut ? ' card--soldout' : ''}`} aria-busy={busy}>
      <div className="case-tile" aria-hidden="true">
        <div className="case-shell" style={{ background: product.caseColor }}>
          <div className="case-camera">
            <i />
            <i />
          </div>
          <span className="case-emoji">{product.emoji}</span>
        </div>
      </div>

      <div className="card__body">
        <h2>{product.name}</h2>
        <p className="card__desc">{product.description}</p>
        <div className="card__meta">
          <span className="price">{formatCents(product.priceCents)}</span>
          <span className={`stock${product.stock <= 2 ? ' stock--low' : ''}`}>
            {soldOut
              ? 'Esgotado'
              : product.stock <= 2
                ? `Só ${product.stock} restante(s)!`
                : `${product.stock} em estoque`}
          </span>
        </div>

        <div className="card__actions">
          <div className="stepper" role="group" aria-label={`Quantidade de ${product.name}`}>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={disabled || quantity <= 1}
              aria-label="Diminuir quantidade"
            >
              −
            </button>
            <span aria-live="polite">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              disabled={disabled || quantity >= 99}
              aria-label="Aumentar quantidade"
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            disabled={disabled}
            onClick={() => void submit(quantity)}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            {soldOut ? 'Esgotado' : buttonLabel}
          </button>
        </div>

        <StatusPanel state={state} onRetry={() => void submit(quantity)} />
      </div>
    </article>
  );
}
