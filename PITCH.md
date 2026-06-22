# Pitch — Gêmeo Digital de Painéis Solares

---

## Você já instalou painéis solares e ficou sem saber se eles estão funcionando de verdade?

Essa é a pergunta que originou este projeto.

---

## O Problema

Quem tem painéis solares em casa ou na empresa geralmente só descobre que algo está errado quando a conta de luz sobe — semanas depois. Não existe nenhuma ferramenta simples, visual e acessível que diga ao proprietário, em tempo real:

> *"O painel 3 está com problema. Pode ser sujeira. Vale a pena dar uma olhada."*

O monitoramento existente no mercado é técnico demais, caro demais, ou simplesmente não existe para o usuário comum. E quando existe, mostra números — não respostas.

---

## O Objetivo

Criar um software de monitoramento inteligente que qualquer pessoa consiga usar — sem precisar ser engenheiro — e que diga exatamente **o que está acontecendo, por que importa e o que fazer**.

---

## Por Que Isso Importa

O Brasil é um dos países com maior irradiação solar do mundo. Goiânia, por exemplo, registra picos de quase **1.500 W/m²** no verão — um potencial enorme. Mesmo assim, uma grande parcela dos sistemas instalados opera abaixo da capacidade por falta de manutenção simples: sujeira acumulada, sombra de árvore crescida, um painel aquecendo mais do que deveria.

Uma limpeza de R$ 150 pode recuperar 20% de produção perdida. Mas o dono precisa **saber que tem um problema** para tomar essa decisão.

Enquanto isso não acontece, ele perde dinheiro todos os dias — sem perceber.

---

## A Solução: Gêmeo Digital

Desenvolvemos um **Gêmeo Digital** — uma réplica virtual inteligente da usina que acompanha cada painel em tempo real, pensa junto com o proprietário e avisa antes que o prejuízo apareça na conta de luz.

**Na tela, o proprietário vê:**

- Uma **representação 3D** de todos os painéis da usina, coloridos em tempo real: verde = tudo certo, amarelo = atenção, vermelho = problema
- Um **banner de status imediato**: *"Sistema normal ✅"* ou *"2 painéis com desempenho reduzido ⚠ — verifique o mapa"*
- **Quanto está gerando agora** e **quanto era esperado para hoje**, com base na previsão do tempo do dia
- A **previsão de eficiência dos próximos dias** — se vem chuva, o sistema já avisa que a produção vai cair e que é normal
- Um **histórico de eventos** em linguagem simples: *"Painel 1-3 produziu 32% abaixo do esperado. Verifique se há sombra ou sujeira."*
- **Alertas inteligentes** por notificação: temperatura crítica detectada, painel desconectado automaticamente por segurança, dia com desempenho abaixo da média

Ao clicar em qualquer painel no mapa 3D, o sistema mostra os dados específicos daquele painel — sem precisar chamar ninguém para checar.

---

## Como Funciona por Dentro

O sistema conecta três fontes de informação em tempo real:

1. **Os inversores da usina** — lemos os dados de produção diretamente dos equipamentos já instalados, sem hardware adicional
2. **A estação meteorológica local** — temperatura, umidade, vento e irradiação solar do momento
3. **A previsão do tempo** — para antecipar o que acontecerá nos próximos dias e calcular o quanto a usina deveria estar produzindo

Com esses dados, o Gêmeo Digital calcula continuamente o que é normal, detecta o que foge do padrão e explica o que fazer — em português, sem jargão técnico.

---

## Tecnologias

| Componente | Tecnologia |
|---|---|
| Aplicativo desktop instalável | Electron — roda em Windows, Mac e Linux |
| Visualização 3D interativa | Babylon.js |
| Dados climáticos em tempo real | API meteorológica (Open-Meteo / INMET) |
| Previsão de eficiência | Modelo PV + previsão do tempo (próximos 7 dias) |
| Integração com inversores | Protocolo Modbus / API do fabricante |
| Gráficos e telemetria | Chart.js |

Não é necessário instalar sensores extras. O sistema usa o que já existe na usina.

---

## Resultados — O Que Já Entregamos

O protótipo atual simula uma usina completa com até 100 painéis e já demonstra as capacidades centrais do produto:

- Detecta automaticamente painéis com produção abaixo do esperado e orienta o proprietário
- Desliga preventivamente painéis com temperatura crítica — antes que cause dano — e registra o evento no histórico
- Calcula diariamente a energia esperada com base no clima, e compara com o que foi efetivamente gerado
- Separa **saúde do painel** (estado físico, independe do clima) de **eficiência de produção** (varia com o sol do dia) — permitindo diagnósticos precisos mesmo em dias nublados

---

## Conclusão

O Gêmeo Digital é o assistente que faltava para quem investiu em energia solar e quer garantir que esse investimento está rendendo o máximo.

Não é um painel de dados para técnicos. É uma ferramenta para o dono da usina tomar decisões simples, na hora certa, com informação clara.

A arquitetura foi projetada para escalar: do proprietário residencial com 10 painéis até empresas com centenas de módulos em múltiplos telhados.

> **O Gêmeo Digital não substitui o técnico. Ele avisa na hora certa para chamar um — e só quando realmente precisa.**
