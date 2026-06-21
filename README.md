# Gêmeo Digital — Painéis Solares

Aplicativo desktop de monitoramento e simulação de instalações fotovoltaicas, desenvolvido para a disciplina de Gêmeos Digitais (GD-2026-01) — UFG, prof. Iwens.

Visualização 3D interativa em tempo real com dados horários reais da NASA POWER para Goiânia/GO.

## Funcionalidades

- Visualização 3D da grade de painéis solares (Babylon.js)
- Dashboard de telemetria ao vivo: irradiação, temperatura do ar, temperatura da célula, eficiência média e potência total
- Gráfico de geração de energia das últimas horas simuladas
- Controles de simulação: Play/Pause e velocidades 1× / 5×
- Chaos Mode: simulação de falhas reais por painel individual (superaquecimento, falha de sensor, dado corrompido)
- Tema dark/light e interface em português e inglês
- Tela de configuração: nome da instalação, tipo de painel e grade (6 a 100 painéis em retângulo)

## Stack

- **Desktop:** Electron
- **3D:** Babylon.js (CDN)
- **Gráficos:** Chart.js (CDN)
- **Frontend:** HTML/CSS/JavaScript Vanilla
- **Dados:** CSV local via Node.js `fs` (NASA POWER — 9.456 horas, mai/2025 → mai/2026)
- **Build:** electron-builder

## Estrutura

```
src/
├── main/
│   ├── main.js          # Processo principal, janela e menu
│   ├── preload.js       # contextBridge (IPC seguro)
│   ├── ipc-handlers.js  # Loop de simulação e Chaos Mode
│   └── csv-reader.js    # Leitura do CSV via fs
├── renderer/
│   ├── index.html       # UI principal
│   ├── app.js           # Orquestração de ticks IPC
│   ├── scene.js         # Cena 3D Babylon.js
│   └── dashboard.js     # Cards, gráfico e controles
└── shared/
    └── constants.js     # Constantes do modelo fotovoltaico
docs/
├── Dados_Horarios.csv   # Série horária NASA POWER
├── Parametros.csv       # Parâmetros do modelo
├── Resumo_Diario.csv
├── Resumo_Mensal.csv
└── Metodologia.md
```

## Requisitos do sistema

O app roda em **Windows, Linux e macOS** (desktop). Não é compatível com mobile (Android/iOS) — Electron é exclusivamente desktop.

| Plataforma | Versão mínima | Arquitetura |
|---|---|---|
| Windows | 10 ou 11 | x64 |
| Linux | Qualquer distro moderna (kernel 4.4+) | x64 |
| macOS | 10.15 Catalina | x64 ou Apple Silicon (arm64) |

**Para rodar a partir do código-fonte** (qualquer plataforma):
- Node.js 18 ou superior
- npm 9 ou superior

## Como rodar

```bash
npm install
npm start
```

## Como buildar

```bash
# Windows (.exe)
npm run build:win

# Linux (.AppImage)
npm run build:linux

# macOS (.dmg)
npm run build:mac
```

O instalador gerado fica em `dist/`.
