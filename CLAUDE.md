# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Visão Geral do Projeto

Gêmeo Digital de painéis solares — aplicativo desktop instalável (cross-platform) que simula em tempo real o comportamento de uma usina fotovoltaica, alimentado por dados históricos horários da NASA POWER. Destina-se a proprietários de painéis solares sem formação técnica, exibindo dados de forma visual e acionável.

## Estado Atual do Projeto

| Componente | Status |
|---|---|
| Estrutura Electron com IPC | **Implementado** |
| Viewport 3D com Babylon.js | **Implementado** |
| Dashboard de telemetria | **Implementado** |
| Leitura de CSV via `fs` | **Implementado** |
| Chaos Mode (janela flutuante) | **Implementado** |
| Banner de status global | **Implementado** |
| Histórico de eventos (feed) | **Implementado** |
| Gauge de irradiância (canvas) | **Implementado** |
| Heatmap de temperatura | **Implementado** |
| Gráfico de produção vs previsão | **Implementado** |
| Persistência noturna de anomalias | **Implementado** |
| Métricas de energia diária (kWh) | **Implementado** |

## Comandos

* Dev: `npm start`
* Build: `electron-builder` (a configurar)

## Stack

* **Desktop:** Electron
* **Frontend:** HTML/CSS e JavaScript Vanilla
* **3D:** Babylon.js (via CDN)
* **Gráficos:** Chart.js 4.4.0 (via CDN)
* **Dados:** Leitura local de CSV via `fs` (Node.js)

## Estrutura de Pastas

```
/
├── docs/                       # Documentação e dados de simulação
│   ├── Metodologia.md
│   ├── Parametros.csv
│   ├── Dados_Horarios.csv      # Base de dados principal — NÃO ler na íntegra
│   ├── Resumo_Diario.csv
│   └── Resumo_Mensal.csv
├── src/
│   ├── main/
│   │   ├── main.js             # Ponto de entrada Electron, menu da aplicação
│   │   ├── ipc-handlers.js     # Motor de simulação + todos os handlers IPC
│   │   ├── csv-reader.js       # Leitura de CSV via fs (getRow usa Math.floor)
│   │   └── chaos-window.js     # Cria a janela flutuante do Chaos Mode
│   ├── renderer/
│   │   ├── index.html          # UI principal (dashboard, 3D, sidebar, footer)
│   │   ├── preload.js          # Expõe window.electronAPI via contextBridge
│   │   ├── app.js              # Inicialização, IPC do renderer, tooltip de painel
│   │   ├── scene.js            # Babylon.js — cena 3D, câmera, painéis, cores
│   │   ├── dashboard.js        # Sensores, gráficos, histórico, energia, banner
│   │   ├── chaos.html          # Janela do Chaos Mode
│   │   └── chaos-preload.js    # Expõe window.chaosAPI via contextBridge
│   └── shared/
│       └── constants.js        # PANEL_TYPES, MODEL, SIMULATION, FAULT_THRESHOLDS
├── package.json
└── CLAUDE.md
```

## Configuração da Matriz de Painéis

* Configurável entre **6 e 100** painéis; a grade deve formar um **retângulo completo**.
* IDs seguem o padrão `panel_{row}_{col}` com índices **1-based** (ex: `panel_1_1`, `panel_2_3`).
* Tipos de painel disponíveis em `constants.js`: `60CEL`, `72CEL`, `144CEL`.
  * `144CEL` usa `csvKey: 'MODERNO'` para mapear as colunas do CSV (ex: `MODERNO_Preal_W`).

## Arquitetura de Dados e Documentação

| Ficheiro | Papel na Aplicação | Regra de Leitura |
|---|---|---|
| `docs/Metodologia.md` | Ignorado pela aplicação | **LEITURA OBRIGATÓRIA** para entender o domínio e as fórmulas PV |
| `docs/Parametros.csv` | Ignorado pela aplicação | **LEITURA OBRIGATÓRIA** para extrair constantes para `constants.js` |
| `docs/Dados_Horarios.csv` | Base de dados principal | **PROIBIDO LER NA ÍNTEGRA** — apenas cabeçalho e primeiras linhas |
| `docs/Resumo_Diario.csv` / `Resumo_Mensal.csv` | Gráficos históricos | Apenas o cabeçalho |

## Contrato IPC (Main ↔ Renderer)

Canal principal: `simulation:tick`. O renderer **nunca** lê arquivos diretamente.

```js
{
  timestamp: "2025-06-21T14:00:00",  // ISO da linha atual do CSV
  speed: 1.0,                         // h/s — decimal, mín 0.1, máx 999
  isPaused: false,
  isTimerTick: true,                  // false em re-emissões por slider/IPC

  dailyExpectedWh: 48320.0,           // Wh esperados no dia (pré-calculado à meia-noite)

  globalMetrics: {
    ghi: 850.2,           // W/m² — CSV ou valor do override global (quando ghiGroup=null)
    airTemp: 28.5,        // °C
    rh: 65.0,             // % umidade relativa
    wind: 3.2,            // m/s
    avgCellTemp: 41.3,    // °C — média dos painéis ativos
    avgEfficiency: 95.4,  // % — produção relativa ao esperado (pode passar de 100%)
    avgHealth: 88.0,      // % — estado físico médio dos painéis (sempre 0-100%)
    totalPower: 12400.0,  // W — soma da potência atual
    totalExpected: 11800.0 // W — soma do pReal do CSV (previsão do dia)
  },

  panels: [
    {
      id: "panel_1_1",
      row: 0, col: 0,          // índices internos 0-based (id é 1-based)
      power: 412.5,            // W — produção atual
      expectedPower: 390.0,    // W — pReal do CSV (previsão)
      efficiency: 105.8,       // % — produção relativa ao esperado (pode >100%)
      health: 100.0,           // % — estado físico, 0-100% (independe da irradiância)
      cellTemp: 40.8,          // °C
      status: "normal",        // ver tabela de status abaixo
      autoOff: false           // true se desligado preventivamente pelo gêmeo
    }
  ],

  autoEvents: [],      // eventos automáticos do tick (overheat, wind, etc.)
  decisions: [],       // log das últimas 50 decisões autônomas do gêmeo
  chaosActive: false,
  activeFailures: [],  // [{ id, type, intensity }]
  globalOverrides: {   // estado atual dos sliders do Chaos Mode
    ghi: null, wind: null, rh: null, tempOffset: 0, ghiGroup: null
  }
}
```

### Status dos painéis

| `status` | Origem | Comportamento |
|---|---|---|
| `normal` | — | Verde no mapa 3D |
| `overheat` | Chaos Mode | Derating térmico; pode causar `auto_off` |
| `hotspot` | Chaos Mode | Ponto quente, degradação parcial |
| `pid` | Chaos Mode | Degradação PID gradual |
| `string_fail` | Chaos Mode | Produção zero |
| `bypass_fail` | Chaos Mode | Falha em diodo de bypass |
| `soiling` | Chaos Mode | Sujeira, perda de eficiência |
| `sensor_fail` | Chaos Mode | Dado zerado |
| `corrupted` | Chaos Mode | Dados exibidos como N/A |
| `auto_off` | Gêmeo Digital | Desligamento preventivo por temp crítica; só reverte com `reinstate:panel` |

## Modelo de Simulação — Decisões de Arquitetura

### Separação health vs efficiency
* **`health`** = `min(effHealth, 100)` — estado físico do painel, derivado exclusivamente das falhas do Chaos Mode. Exibido no card "Saúde dos painéis". Nunca ultrapassa 100%.
* **`efficiency`** = `effHealth × ghiRatio` — produção relativa ao CSV baseline. Usado para colorir o mapa 3D e alertas. Pode passar de 100% em dias extra-ensolarados.

### GHI Override (Chaos Mode)
* Sem override: `ghiRatio = 1`, `power = pReal × (effHealth/100)`.
* Com override ativo (`isGhiOverride = true`):
  * `ghiRatio = ghiForPanel / 1000` (normalizado para STC — evita distorção de curva no amanhecer)
  * `pBase = ghiForPanel × Pmax/1000 × PR` (sem fNormal — simula sol artificial com curva plana)
  * `power = pBase × (effHealth/100)`
* `expectedPower` é **sempre** do CSV (previsão do tempo), nunca afetado pelo override.
* `globalMetrics.ghi` mostra o valor do override quando ativo para todos os painéis (`ghiGroup === null`).

### Persistência noturna de anomalias
* `lastDaytimeState` Map — armazena `{ eff, status }` de cada painel durante horas diurnas.
* À noite, se o painel aparenta normal mas `last.eff < 85`: herda o estado diurno.
* Limpo por: `reinstate:panel` (individual) e `chaos:clear_all` (global).

### Auto-desligamento preventivo
* `autoShutdown` Set — painel entra quando `cellTemp ≥ CELL_TEMP_SHUTDOWN`.
* Só sai via `reinstate:panel` — **nunca** limpo por `chaos:apply` ou `chaos:clear`.
* `autoShutdown.delete` só é chamado quando o **tipo** de falha muda (não a intensidade).

### Energia diária
* `_dailyExpectedWh` — calculado no main process ao detectar virada de dia (`row['Data']` muda). Soma `pReal × nPainéis` para todas as horas do novo dia.
* No renderer: `kwhGenerated` reseta quando o `timestamp.slice(0,10)` muda. Acumulação: `totalPower × speed / 1000` kWh por tick (escala com a velocidade).

## Chaos Mode — Canais IPC Adicionais

| Canal | Direção | Payload |
|---|---|---|
| `chaos:apply` | renderer → main | `{ panelId, type, intensity }` |
| `chaos:clear_all` | renderer → main | — |
| `chaos:global` | renderer → main | `{ ghi, wind, rh, tempOffset, ghiGroup }` |
| `reinstate:panel` | renderer → main | `{ panelId }` |
| `chaos:state-changed` | main → renderer | notificação de mudança |
| `sim:get-dates` | renderer → main (invoke) | retorna array de `{ date, rowIndex }` |

## Interface — Componentes Principais

* **Banner de status** (`#status-banner`): absoluto no canto superior esquerdo do canvas; classes `banner-ok / banner-warning / banner-critical`. Mostra todos os problemas ativos separados por `·`.
* **Toasts** (`#toast-container`): `position: fixed; top: 60px; right: 276px` — acima do canvas, sem cobrir o sidebar direito (260px).
* **GHI Gauge**: canvas 2D com arco, `MAX = 1500 W/m²`.
* **Gráfico de produção**: Chart.js, labels "Produção atual" / "Previsão do dia".
* **Histórico de eventos** (sidebar esquerda): feed de sintomas — **nunca** expõe tipos de falha do Chaos Mode ao operador.
* **Velocidade de simulação**: slider `min=0.1 max=24 step=0.1`, input numérico `min=0.1 max=999 step=0.1`.

## Restrições Estritas (CRÍTICO)

* **Electron IPC:** Separação absoluta. Main lê CSV e gerencia janela; renderer roda UI e 3D. Dados apenas via `simulation:tick`.
* **Proteção de Contexto:** NUNCA ler `Dados_Horarios.csv`, `Resumo_Diario.csv` ou `Resumo_Mensal.csv` na íntegra.
* **Chaos Mode é ferramenta de desenvolvedor:** O operador nunca vê nomes de falhas injetadas. O histórico mostra apenas sintomas (eficiência baixa, desligamento).
* **Idioma:** Código e variáveis em inglês. Chat, comentários e commits em português.
