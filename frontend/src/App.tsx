import { useCallback, useEffect, useState } from 'react';
import { fetchProducts } from './api';
import { ProductCard } from './components/ProductCard';
import { Product } from './types';

export default function App({ pollIntervalMs }: { pollIntervalMs?: number }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshProducts = useCallback(async () => {
    try {
      setProducts(await fetchProducts());
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar a vitrine. O backend está rodando na porta 3001?');
    }
  }, []);

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  return (
    <div className="page">
      <header className="hero">
        <p className="hero__brand">CaseCellShop</p>
        <h1>
          Capinhas que aguentam o tranco.
          <br />
          <em>Checkout também.</em>
        </h1>
        <p className="hero__note">
          Demo técnica: o ERP é <strong>simulado</strong> com latência de 0,4–2,5s e ~35% de
          falhas transitórias por chamada. Compre algo e veja os retries, a idempotência e a
          devolução de estoque em ação.
        </p>
      </header>

      <main>
        {loadError && (
          <div className="status status--error" role="alert">
            <strong>Ops!</strong>
            <span>{loadError}</span>
            <button type="button" className="btn btn--ghost" onClick={() => void refreshProducts()}>
              Tentar de novo
            </button>
          </div>
        )}

        {!products && !loadError && <p className="loading-list">Carregando capinhas…</p>}

        {products && (
          <section className="grid" aria-label="Vitrine de capinhas">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSettled={() => void refreshProducts()}
                pollIntervalMs={pollIntervalMs}
              />
            ))}
          </section>
        )}
      </main>

      <footer className="footer">
        Desafio técnico CaseCellShop · dados em memória · nenhum pagamento real
      </footer>
    </div>
  );
}
