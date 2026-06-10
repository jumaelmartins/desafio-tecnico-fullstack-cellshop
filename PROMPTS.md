# PROMPTS.md — Registro de Uso de IA

Este projeto permitia o uso de IA como apoio ao desenvolvimento. A IA foi utilizada como ferramenta de aceleração para estruturar uma primeira versão da solução, revisar aderência ao desafio, apoiar a documentação e levantar possíveis pontos de melhoria.

As decisões técnicas finais, validação da entrega, execução local, análise dos testes e revisão de coerência foram realizadas manualmente.

---

## Ferramentas utilizadas

* Claude Code (Fable 5.0) — geração inicial do mini-projeto e apoio na implementação.
* Claude Code (Opus 4.8, modelo alternativo) — revisão independente da entrega em relação ao enunciado.
* ChatGPT — apoio na revisão crítica das respostas conceituais, README e refinamento da documentação.

---

## Prompt 1 — Geração inicial do projeto

**Objetivo:** gerar uma primeira versão funcional do mini-projeto fullstack com base no PDF do desafio.

```text
Analise o PDF do desafio técnico em anexo e implemente uma solução completa para o mini-projeto solicitado.

O projeto deve seguir a stack preferencial do desafio:
- Backend com Node.js, TypeScript e Express;
- Frontend com React, TypeScript e Vite.

A solução deve implementar um fluxo fullstack de checkout para compra de capinhas de celular, contemplando:

- API para listar produtos;
- API para criar tentativa de compra;
- validação de entradas inválidas;
- diferenciação entre sucesso, erro de validação, estoque insuficiente e falha técnica;
- prevenção contra venda acima do estoque disponível;
- estratégia contra pedido duplicado usando Idempotency-Key;
- simulação de ERP lento ou instável;
- tela simples para listar produtos;
- seleção de quantidade;
- loading no checkout;
- prevenção contra múltiplos cliques;
- mensagens compreensíveis para sucesso, estoque insuficiente, entrada inválida e falha temporária;
- estado coerente após erro ou retry.

Também inclua:
- README com instruções de execução;
- testes automatizados relevantes;
- explicação das decisões técnicas;
- limitações conhecidas;
- próximos passos.
```

---

## Prompt 2 — Revisão independente da entrega

**Objetivo:** verificar se a solução implementada estava aderente ao enunciado, sem alterar o código automaticamente.

```text
Analise o PDF do desafio técnico e compare com o projeto implementado neste repositório.

Não altere o código existente.

Quero um relatório técnico detalhado informando:

- se todos os requisitos obrigatórios foram atendidos;
- quais itens do checklist do desafio estão cobertos;
- quais pontos estão parcialmente cobertos;
- possíveis riscos ou inconsistências;
- qualidade da arquitetura proposta;
- qualidade do backend;
- qualidade do frontend;
- qualidade dos testes;
- qualidade do README;
- pontos que podem ser melhorados antes da entrega.

Ao final, traga uma lista objetiva de ajustes recomendados, priorizados por impacto.
```

---

## Prompt 3 — Ajuste pontual após revisão

**Objetivo:** aplicar apenas o ajuste identificado na revisão, mantendo o restante da solução estável.

```text
Com base no relatório de revisão, aplique somente o ajuste recomendado como necessário, sem reestruturar o projeto e sem alterar o comportamento já validado pelos testes.

Após o ajuste:
- mantenha a compatibilidade com os testes existentes;
- preserve a arquitetura atual;
- não adicione escopo desnecessário;
- atualize a documentação somente se fizer sentido.
```

---

## Prompt 4 — Revisão das respostas conceituais

**Objetivo:** revisar a Parte 1.A do desafio, garantindo clareza, coerência técnica e alinhamento com o mini-projeto.

```text
Revise minhas respostas conceituais da Parte 1.A do desafio técnico.

Avalie se as respostas estão coerentes com o enunciado e com o mini-projeto implementado.

Quero uma crítica técnica sobre:
- diagnóstico dos problemas;
- trade-offs propostos;
- arquitetura incremental;
- tratamento de estoque, concorrência e idempotência;
- contrato de API e modelo de erros;
- estratégia de testes;
- clareza da comunicação;
- pontos que poderiam gerar interpretação ambígua pelo avaliador.

Sugira ajustes apenas onde houver ganho real de clareza ou precisão técnica.
```

---

## Prompt 5 — Revisão do README

**Objetivo:** melhorar a documentação do projeto para facilitar avaliação e execução local.

```text
Revise o README do mini-projeto.

Verifique se ele explica bem:
- objetivo do projeto;
- stack utilizada;
- como rodar backend e frontend;
- como executar os testes;
- como controlar a simulação do ERP;
- decisões técnicas;
- limitações conscientes;
- próximos passos;
- mapeamento com o checklist do desafio.

Sugira melhorias de clareza, precisão técnica e organização, sem transformar o README em um documento excessivamente longo.
```

---

## Como validei a saída da IA

Após a geração e revisão com IA, realizei validações manuais:

* leitura do código para entender as decisões implementadas;
* execução local do backend e frontend;
* execução da suíte de testes automatizados;
* validação manual do fluxo de checkout pela interface;
* verificação dos cenários de sucesso, estoque insuficiente, erro de validação, retry e pedido duplicado;
* revisão da documentação para garantir que ela não prometesse algo diferente do que foi implementado.

---

## Partes em que usei julgamento próprio

A IA ajudou a acelerar a implementação e documentação, mas as decisões abaixo foram revisadas criticamente:

* uso de checkout assíncrono com `202 Accepted`;
* uso de `Idempotency-Key`;
* tratamento de replay e conflito de idempotência;
* reserva de estoque com expiração;
* simulação de ERP instável;
* diferenciação dos modelos de erro;
* explicação das limitações do uso de memória e worker in-process;
* aderência entre mini-projeto, README e respostas conceituais.

---

## Riscos considerados

O uso de IA pode gerar código plausível, mas incorreto. Por isso, os principais riscos avaliados foram:

* race conditions não percebidas;
* testes que passam sem validar a invariante correta;
* inconsistência entre documentação e implementação;
* uso de APIs ou bibliotecas de forma incorreta;
* excesso de escopo para o prazo do desafio;
* dificuldade de explicar o código em uma entrevista técnica posterior.

Para mitigar esses riscos, mantive a solução pequena, executável, testada e documentada, com foco nas invariantes principais do desafio: não vender sem estoque, não duplicar pedido e lidar com ERP lento ou instável.
