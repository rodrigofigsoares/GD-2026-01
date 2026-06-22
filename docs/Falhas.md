# Catálogo de Falhas — Gêmeo Digital de Painéis Solares (Goiânia)

Este documento mapeia as falhas que o gêmeo digital deve ser capaz de detectar,
suas consequências físicas no painel, e a decisão que o sistema deve tomar.

Cada falha indica:
- **Variável(eis) do CSV usada(s)** para detectar
- **Condição de gatilho** (regra que dispara o alerta)
- **Consequência física** se não tratada
- **Decisão do gêmeo digital** (o que o sistema simula/recomenda fazer)
- **Nível de severidade**: 🟢 Normal · 🟡 Atenção · 🟠 Alerta · 🔴 Crítico

---

## 1. Falhas Elétricas

### 1.1 Sobreaquecimento (Overheating)
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `T2M` |
| **Gatilho** | `T2M > 55°C` (atenção) · `T2M > 65°C` (crítico) |
| **Consequência física** | Degradação acelerada do encapsulamento (EVA), queda de eficiência (~0,4%/°C acima de 25°C), risco de delaminação e redução da vida útil do módulo |
| **Decisão do gêmeo** | 🟡 Atenção: reduzir a potência simulada do painel (derating) e notificar painel de status. 🔴 Crítico: simular desconexão da string afetada (`P_real → 0`), disparar alerta sonoro/visual no HUD, registrar evento no log de manutenção |
| **Severidade** | 🟡 → 🔴 |

### 1.2 Hot-Spot (célula sombreada gerando ponto de calor)
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `T2M` + `P_real_W` (comparado ao esperado pela irradiância) |
| **Gatilho** | `P_real` muito abaixo do esperado para a `IRRADIACAO_ATLAS` vigente, combinado a `T2M` elevado pontualmente |
| **Consequência física** | Ponto de superaquecimento localizado pode danificar permanentemente a célula, criar microfissuras, e em casos extremos iniciar combustão do laminado |
| **Decisão do gêmeo** | 🟠 Isolar visualmente o painel afetado (mudar cor para vermelho/laranja pulsante), simular ativação de diodo de bypass, recomendar inspeção termográfica manual |
| **Severidade** | 🟠 |

### 1.3 Degradação Induzida por Potencial (PID)
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `P_real_W` vs `P_pico_W` (tendência ao longo de múltiplos dias) |
| **Gatilho** | Queda gradual e consistente da eficiência (`P_real/P_pico`) ao longo de semanas, não explicada por temperatura ou irradiância |
| **Consequência física** | Perda permanente de potência (pode chegar a 30%+), corrosão do material semicondutor por fuga de corrente para o terra |
| **Decisão do gêmeo** | 🟡 Registrar tendência no histórico, gerar alerta de manutenção preditiva, sugerir inspeção do sistema de aterramento/inversor |
| **Severidade** | 🟡 (cumulativo) |

### 1.4 Falha de String / Desconexão
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `P_real_W` |
| **Gatilho** | `P_real_W ≈ 0` durante horário diurno (`HR` entre 6–18) com `IRRADIACAO_ATLAS > 0` |
| **Consequência física** | Perda total de geração daquele conjunto de painéis; se não detectado, perda financeira contínua |
| **Decisão do gêmeo** | 🔴 Marcar painel/string como offline no modelo 3D (cor cinza/apagado), disparar notificação imediata, registrar timestamp da falha para análise |
| **Severidade** | 🔴 |

### 1.5 Falha de Diodo de Bypass
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `T2M` (elevação anômala) + `P_real_W` (queda parcial, não total) |
| **Gatilho** | Queda parcial de potência persistente acompanhada de elevação de temperatura num subconjunto do painel |
| **Consequência física** | Sobrecarga térmica progressiva na célula sombreada/danificada, risco de propagação para hot-spot |
| **Decisão do gêmeo** | 🟠 Sinalizar painel específico, simular redução de carga na string, recomendar substituição do diodo na próxima manutenção |
| **Severidade** | 🟠 |

---

## 2. Falhas Ambientais / Climáticas

### 2.1 Sujeira / Acúmulo de Poeira (Soiling)
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `P_real_W` vs `IRRADIACAO_ATLAS_Wh_m2_dia` (razão caindo) + `WS10M` baixo prolongado (sem vento para limpar) |
| **Gatilho** | Eficiência (`P_real/P_pico`) declinando de forma lenta e constante em dias sem chuva, correlacionado a baixa `WS10M` |
| **Consequência física** | Redução de geração de 5–25%, sombreamento parcial que pode evoluir para hot-spot localizado |
| **Decisão do gêmeo** | 🟡 Acumular um "índice de sujidade" estimado, sugerir agendamento de limpeza quando a perda estimada superar um limiar (ex: 10%) |
| **Severidade** | 🟡 |

### 2.2 Sombreamento (nuvens, objetos, vegetação)
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `IRRADIACAO_ATLAS_Wh_m2_dia` (queda abrupta e momentânea) |
| **Gatilho** | Queda súbita de `IRRADIACAO_ATLAS` entre frames consecutivos, sem corresponder ao padrão diário esperado (nascer/pôr do sol) |
| **Consequência física** | Nenhum dano físico direto (é transitório), mas reduz geração instantânea; sombreamento parcial recorrente pode causar hot-spot com o tempo |
| **Decisão do gêmeo** | 🟢/🟡 Apenas refletir a queda de potência no HUD sem alarme se for transitório (poucos frames); se recorrente no mesmo horário por vários dias, sinalizar como possível obstrução fixa (árvore, construção) |
| **Severidade** | 🟢 transitório / 🟡 recorrente |

### 2.3 Chuva Intensa / Umidade Excessiva
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `RH2M` (umidade relativa) |
| **Gatilho** | `RH2M > 85%` sustentado |
| **Consequência física** | Risco de infiltração em caixas de junção, corrosão de conectores, possível curto-circuito se houver vedação comprometida |
| **Decisão do gêmeo** | 🟡 Sinalizar "condição de risco de infiltração", recomendar inspeção de vedação após o evento, sem alterar geração diretamente |
| **Severidade** | 🟡 |

### 2.4 Vento Forte
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `WS10M` |
| **Gatilho** | `WS10M > 15 m/s` (atenção) · `WS10M > 25 m/s` (crítico) |
| **Consequência física** | Estresse mecânico na estrutura de fixação, risco de levantamento de módulos, possível dano à moldura/conectores em rajadas extremas |
| **Decisão do gêmeo** | 🟡 Sinalizar condição de vento elevado. 🔴 Simular "modo de proteção": recomendar ou simular recolhimento/ajuste de ângulo (se a estrutura for motorizada) e registrar evento |
| **Severidade** | 🟡 → 🔴 |

### 2.5 Baixa Irradiância Anômala (não explicada por hora do dia)
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `IRRADIACAO_ATLAS_Wh_m2_dia` comparado ao histórico médio daquele mês/horário |
| **Gatilho** | Irradiância muito abaixo da média histórica para o mesmo dia/hora do ano (ex: comparar com mesmo mês em anos anteriores) |
| **Consequência física** | Nenhuma direta — é informação climática, mas pode mascarar outras falhas se não diferenciada delas |
| **Decisão do gêmeo** | 🟢 Apenas anotar como "dia de baixa irradiância" para não confundir com falha de equipamento na análise de eficiência |
| **Severidade** | 🟢 informativo |

---

## 3. Falhas Mecânicas / Estruturais

### 3.1 Corrosão de Conectores/Estrutura
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | Não diretamente mensurável pelo CSV atual — **inferida por correlação**: `RH2M` alto histórico acumulado + idade do sistema |
| **Gatilho** | Tempo de operação acumulado + exposição cumulativa a `RH2M > 80%` superando um limiar (ex: X meses) |
| **Consequência física** | Aumento da resistência de contato, perdas ôhmicas, ponto de superaquecimento podendo evoluir para falha elétrica |
| **Decisão do gêmeo** | 🟡 Gerar alerta de manutenção preventiva baseado em tempo + exposição ambiental acumulada (não em leitura instantânea) |
| **Severidade** | 🟡 (preditivo) |

### 3.2 Falha de Fixação / Afrouxamento Estrutural
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `WS10M` (eventos de vento forte acumulados) |
| **Gatilho** | Contagem de eventos de vento acima do limiar crítico (`>25 m/s`) ao longo do tempo |
| **Consequência física** | Folga progressiva nos suportes, desalinhamento do ângulo de inclinação, redução de eficiência por posicionamento subótimo, risco de queda |
| **Decisão do gêmeo** | 🟡 Após N eventos de vento crítico registrados, sugerir inspeção estrutural física |
| **Severidade** | 🟡 (preditivo) |

### 3.3 Desvio do Ângulo de Inclinação Ótimo
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `P_real_W` vs `IRRADIACAO_ATLAS` esperado para o ângulo de projeto |
| **Gatilho** | Eficiência consistentemente abaixo do esperado em horários de pico solar (meio-dia), mas normal nas bordas do dia — padrão típico de desalinhamento |
| **Consequência física** | Perda de geração por incidência solar subótima, sem dano físico direto |
| **Decisão do gêmeo** | 🟡 Sinalizar possível desalinhamento, sugerir verificação do ângulo de instalação |
| **Severidade** | 🟡 |

### 3.4 Degradação por Ciclos Térmicos (fadiga material)
| Campo | Detalhe |
|---|---|
| **Variáveis CSV** | `T2M` (amplitude diária — diferença entre máxima e mínima do dia) |
| **Gatilho** | Grande amplitude térmica diária repetida (`ΔT2M > 25°C/dia`) acumulada por longos períodos |
| **Consequência física** | Microfissuras nas células e nas soldas por expansão/contração repetida, queda gradual de eficiência |
| **Decisão do gêmeo** | 🟢 Registrar amplitude térmica diária no histórico para correlacionar com queda de eficiência de longo prazo |
| **Severidade** | 🟢 (preditivo/longo prazo) |

---

## 4. Resumo — Matriz de Decisão Rápida

| Severidade | Ação visual no gêmeo | Ação de sistema |
|---|---|---|
| 🟢 Normal/Informativo | Cor padrão (azul/ciano), sem badge | Apenas log no histórico |
| 🟡 Atenção | Cor amarela/laranja suave, badge "Atenção" | Notificação não-bloqueante + registro para manutenção preditiva |
| 🟠 Alerta | Cor laranja forte/pulsante, badge "Alerta" | Notificação destacada, simular redução de carga (derating) |
| 🔴 Crítico | Cor vermelha pulsante, painel "apagado" se desconectado | Notificação imediata + simular desconexão da string + log de evento crítico com timestamp |

---

## 5. Variáveis que o CSV ainda não cobre (sugestão de extensão futura)

Para detectar todas as falhas acima com precisão (não apenas inferência indireta), valeria
a pena adicionar ao seu pipeline de simulação:

- **Tensão e corrente por string** (não só potência agregada) — ajuda a isolar falha elétrica por painel individual
- **Histórico de manutenção** (datas de limpeza, inspeção) — para soiling e corrosão
- **Ângulo de inclinação real medido** — para detectar desvio físico vs. ângulo de projeto
- **Contador de ciclos de chuva/vento extremo** — já pode ser derivado de `RH2M`/`WS10M`, mas precisa de lógica de acumulação no código, não está pronto no CSV puro