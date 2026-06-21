# Visão Geral do Projeto

Projeto de Gêmeo Digital de painéis solares, focado em uma apresentação de produto para clientes. O objetivo é uma visualização 3D em tempo real e interativa usando Babylon.js, alimentada por dados sintéticos (NASA POWER).
O software deve ser um aplicativo desktop instalável (cross-platform).

## Estado Atual do Projeto

| Componente | Status |
|---|---|
| Código inicial de testes com visualização HTML | Existe — deve ser refatorado |
| Estrutura Electron com IPC | Pendente |
| Viewport 3D com Babylon.js | Pendente |
| Dashboard de telemetria | Pendente |
| Leitura de CSV via `fs` | Pendente |
| Chaos Mode | Pendente |

> O ponto de partida é o código HTML de testes existente. Ele deve ser descartado ou migrado para a arquitetura Electron correta descrita neste documento.

## Stack

* **Desktop:** Electron
* **Frontend:** HTML/CSS e JavaScript Vanilla
* **3D:** Babylon.js
* **Dados:** Leitura local de CSV via `fs` (Node.js)
* **Build:** A definir — provável uso de `electron-builder`

## Estrutura de Pastas

```
/
├── docs/                    # Documentação e dados de simulação
│   ├── Metodologia.md
│   ├── Parametros.csv
│   ├── Dados_Horarios.csv
│   ├── Resumo_Diario.csv
│   └── Resumo_Mensal.csv
├── src/
│   ├── main/                # Main process (Electron)
│   │   ├── main.js          # Ponto de entrada Electron
│   │   ├── ipc-handlers.js  # Handlers de IPC
│   │   └── csv-reader.js    # Leitura de CSV via fs
│   ├── renderer/            # Renderer process (UI)
│   │   ├── index.html
│   │   ├── app.js           # Lógica da UI e IPC do renderer
│   │   ├── scene.js         # Babylon.js — cena 3D
│   │   └── dashboard.js     # Cards, gráficos e telemetria
│   └── shared/
│       └── constants.js     # Constantes extraídas de Parametros.csv
├── package.json
└── CLAUDE.md
```

## Configuração da Matriz de Painéis

O número de painéis é configurável entre **6 e 100**, com a restrição de que a grade deve sempre formar um **retângulo completo** (linhas × colunas sem células vazias).

* Exemplos válidos: 6 (2×3), 8 (2×4), 12 (3×4), 20 (4×5), 24 (4×6), 100 (10×10)
* Exemplos inválidos: 7, 11, 13 (não formam retângulo completo)
* A configuração deve ser exposta em `constants.js` como `PANEL_ROWS` e `PANEL_COLS`
* A UI deve calcular e renderizar a grade dinamicamente com base nesses valores
* IDs dos painéis seguem o padrão `panel_{row}_{col}` (ex: `panel_0_0`, `panel_2_3`)

## Arquitetura de Interface (Dashboard de Telemetria)

* **Conceito Visual:** Dashboard de monitoramento de engenharia (Dark Mode, layout confortável para pessoas leigas, sem excesso de sombras ou elementos visuais supérfluos).
* **Distribuição Espacial:**
  1. **Centro/Principal:** Viewport 3D do Babylon.js. Deve ser totalmente interativo (clicar em um painel isolado abre a telemetria específica dele).
  2. **Painel Esquerdo (Controle & Chaos Mode):** Controles de tempo da simulação (Play/Pause/1x/5x) e gatilhos de simulação de falhas sintéticas (ex: "Forçar Superaquecimento", "Zerar Eficiência de um Painel").
  3. **Painel Direito (Sensores):** Cards de leitura instantânea exibindo os dados da linha atual do CSV: Irradiação (`GHI`), Temp. do Ar vs Temp. da Célula, Eficiência Média (%) e Potência de Saída (W).
  4. **Rodapé:** Um gráfico de linha dinâmico mostrando a curva de geração de energia das últimas horas simuladas — alimentado por `Dados_Horarios.csv`.
* **Interatividade:** Os painéis 3D devem responder a cliques (exibir um tooltip ou modal com os dados daquele painel específico).
* **Transições:** Mudanças de estado (como alertas de erro) devem ter animações suaves e feedback visual claro.

## Arquitetura de Dados e Documentação

Todos os arquivos de dados e documentação estão na subpasta `/docs`. Siga rigorosamente estas regras de acesso:

| Ficheiro | Papel na Aplicação (Electron) | Regra de Leitura para o Claude |
|---|---|---|
| `docs/Metodologia.md` | Ignorado pela aplicação. | **LEITURA OBRIGATÓRIA.** Leia na íntegra para entender o domínio, as fórmulas fotovoltaicas e a lógica do projeto. |
| `docs/Parametros.csv` | Ignorado pela aplicação. | **LEITURA OBRIGATÓRIA.** Leia na íntegra para extrair as constantes (Lat, Lon, Área, PR, NOCT) e convertê-las em variáveis em `constants.js`. |
| `docs/Dados_Horarios.csv` | **Base de Dados Principal.** O `main process` lê este arquivo via Node (`fs`) e envia os dados via IPC para a UI e para o Babylon.js. | **PROIBIDO LER NA ÍNTEGRA.** Leia apenas as primeiras 10 linhas para entender a estrutura. |
| `docs/Resumo_Diario.csv` / `docs/Resumo_Mensal.csv` | Usar para gráficos históricos no dashboard. | Leia apenas o cabeçalho quando for desenvolver gráficos de relatórios. |

## Contrato IPC (Main ↔ Renderer)

O `main process` emite um evento por tick de simulação no canal `simulation:tick`. O `renderer` nunca lê arquivos diretamente — consome apenas o que recebe via IPC.

```js
// Canal IPC: 'simulation:tick'
// Emitido pelo main process a cada avanço de tempo da simulação
{
  timestamp: "2023-06-21T14:00:00Z", // ISO string da linha atual do CSV
  speed: 1,                          // multiplicador de velocidade atual (1 ou 5)
  isPaused: false,                   // estado do play/pause

  globalMetrics: {
    ghi: 850.2,           // W/m² — irradiação global horizontal (do CSV)
    airTemp: 28.5,        // °C — temperatura do ar (do CSV)
    avgCellTemp: 41.3,    // °C — média calculada via fórmula NOCT
    avgEfficiency: 18.4,  // % — média de eficiência de todos os painéis
    totalPower: 12400.0   // W — soma da potência de todos os painéis
  },

  panels: [
    {
      id: "panel_0_0",      // identificador no formato panel_{row}_{col}
      row: 0,
      col: 0,
      power: 412.5,         // W
      efficiency: 18.6,     // %
      cellTemp: 40.8,       // °C
      status: "normal"      // "normal" | "overheat" | "sensor_fail" | "corrupted"
    }
    // ... um objeto por painel (PANEL_ROWS × PANEL_COLS entradas)
  ],

  chaosActive: false,    // true se alguma falha sintética estiver ativa
  activeFailures: []     // ex: ["panel_1_2:overheat", "panel_0_3:sensor_fail"]
}
```

## Módulo de Simulação e Erros (Chaos Mode)

* O Chaos Mode deve ser acessível via **menu da barra superior do aplicativo** (ex: `Simulação > Chaos Mode`), mantendo a interface principal limpa para a apresentação. Serve para simular erros que ocorreriam na vida real em um painel solar.
* Falhas a serem implementadas:
  * `sensor_fail` — eficiência zerada, painel exibido com ícone de erro
  * `overheat` — derating térmico aplicado, temperatura elevada artificialmente
  * `corrupted` — dados do painel exibidos como `N/A` ou `--`
* Ao ativar uma falha, o `main process` deve injetar o status correspondente no campo `status` do painel afetado dentro do payload IPC.

## Restrições Estritas (CRÍTICO)

* **Electron IPC:** Separação absoluta de processos. O `main process` gerencia a janela e lê o CSV; o `renderer process` roda a UI e o 3D (Babylon.js). Todo tráfego de dados ocorre exclusivamente via IPC no canal `simulation:tick`.
* **Proteção de Contexto:** NUNCA leia os arquivos `docs/Dados_Horarios.csv`, `Resumo_Diario.csv` e `Resumo_Mensal.csv` por completo. Leia **apenas o cabeçalho e as primeiras linhas)** para entender a estrutura.
* **Idioma:** Código e variáveis estritamente em inglês. Comunicação no chat, comentários e commits 100% em português.

## Comandos

* Dev: `npm start`
* Build: A definir — provável uso de `electron-builder`