import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { Order, Product } from './types';

// ── Fixtures ───────────────────────────────────────────────────────────────
const PRODUCTS: Product[] = [
  {
    id: 'case-001',
    name: 'Capinha Silicone Soft',
    description: 'Toque aveludado',
    priceCents: 4990,
    stock: 12,
    emoji: '🫧',
    caseColor: '#A78BFA',
  },
  {
    id: 'case-002',
    name: 'Capinha Anti-Impacto Clear',
    description: 'Bordas reforçadas',
    priceCents: 3990,
    stock: 2,
    emoji: '🛡️',
    caseColor: '#7DD3FC',
  },
];

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-123',
    status: 'PROCESSING',
    items: [{ productId: 'case-001', name: 'Capinha Silicone Soft', quantity: 1, unitPriceCents: 4990 }],
    totalCents: 4990,
    attempts: 0,
    maxAttempts: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Roteia o fetch mockado por método+URL. */
function routeFetch(handlers: {
  onCreateOrder?: (init: RequestInit) => ReturnType<typeof jsonResponse>;
  onGetOrder?: () => ReturnType<typeof jsonResponse>;
}) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/products') return jsonResponse(200, { products: PRODUCTS });
    if (url === '/api/orders' && init?.method === 'POST') {
      return handlers.onCreateOrder!(init);
    }
    if (url.startsWith('/api/orders/')) return handlers.onGetOrder!();
    throw new Error(`Rota não mockada: ${url}`);
  });
}

// ── Testes ─────────────────────────────────────────────────────────────────
describe('App', () => {
  it('renderiza a vitrine com os produtos da API', async () => {
    routeFetch({});
    render(<App pollIntervalMs={10} />);

    expect(await screen.findByText('Capinha Silicone Soft')).toBeInTheDocument();
    expect(screen.getByText('Capinha Anti-Impacto Clear')).toBeInTheDocument();
    expect(screen.getByText('R$ 49,90')).toBeInTheDocument();
  });

  it('compra feliz: envia Idempotency-Key, trava o botão durante o processamento e confirma', async () => {
    let capturedKey: string | undefined;
    // O GET /orders/:id fica em PROCESSING até liberarmos a confirmação. Isso
    // torna determinístico o instante em que o botão está travado: sem isso, o
    // caminho feliz mockado (respostas resolvem em microtasks + poll de 10ms)
    // pode concluir dentro da janela do await do clique e o botão reabilitar
    // antes da asserção, deixando o teste instável.
    let confirmed = false;
    routeFetch({
      onCreateOrder: (init) => {
        capturedKey = (init.headers as Record<string, string>)['Idempotency-Key'];
        return jsonResponse(202, { order: order({ status: 'PROCESSING', attempts: 0 }), replayed: false });
      },
      onGetOrder: () =>
        confirmed
          ? jsonResponse(200, { order: order({ status: 'CONFIRMED', attempts: 1, erpOrderId: 'ERP-1' }) })
          : jsonResponse(200, { order: order({ status: 'PROCESSING', attempts: 1 }) }),
    });

    const user = userEvent.setup();
    render(<App pollIntervalMs={10} />);

    const [buyButton] = await screen.findAllByRole('button', { name: 'Comprar' });
    await user.click(buyButton);

    // Anti múltiplos cliques: enquanto o pedido está PROCESSING o botão fica
    // desabilitado. waitFor torna a verificação determinística (o estado é
    // mantido até liberarmos a confirmação abaixo).
    await waitFor(() => expect(buyButton).toBeDisabled());

    // A chave de idempotência foi enviada (é ela que torna retries seguros).
    expect(capturedKey).toBeTruthy();
    expect(capturedKey!.length).toBeGreaterThanOrEqual(8);

    // Agora liberamos a confirmação do ERP.
    confirmed = true;
    expect(await screen.findByText('Compra confirmada! 🎉', undefined, { timeout: 3000 })).toBeInTheDocument();

    // Após estado terminal o botão volta a ficar disponível.
    await waitFor(() => expect(buyButton).toBeEnabled());
  });

  it('estoque insuficiente: mostra mensagem clara com o disponível e reabilita o botão', async () => {
    routeFetch({
      onCreateOrder: () =>
        jsonResponse(409, {
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: 'Estoque insuficiente para Capinha Anti-Impacto Clear.',
            details: { productId: 'case-002', requested: 5, available: 2 },
          },
        }),
    });

    const user = userEvent.setup();
    render(<App pollIntervalMs={10} />);

    await screen.findByText('Capinha Anti-Impacto Clear');
    const buyButtons = screen.getAllByRole('button', { name: 'Comprar' });
    const target = buyButtons[1]; // segundo card (case-002)
    await user.click(target);

    expect(await screen.findByText('Estoque insuficiente')).toBeInTheDocument();
    expect(screen.getByText(/Restam apenas 2 unidade/)).toBeInTheDocument();

    // Estado coerente após o erro: dá para ajustar e tentar de novo.
    await waitFor(() => expect(target).toBeEnabled());
  });
});
