Gêmeo Digital de Painel Solar — Goiânia/GO

Base de dados horária unificada (NASA POWER + previsão climatológica) e modelo de desempenho fotovoltaico

1. Origem dos dados

• Arquivo "POWER_Point_Hourly_...csv" (NASA POWER / MERRA-2 + CERES SYN1deg): série horária real/histórica de 01/05/2025 a 01/05/2026 no ponto (lat -16,7005; lon -49,0000), contendo irradiância global horizontal (ALLSKY_SFC_SW_DWN), temperatura a 2 m (T2M), umidade específica (QV2M), velocidade do vento a 10 m (WS10M) e pressão de superfície (PS).

• A irradiância (ALLSKY_SFC_SW_DWN) da NASA POWER fica indisponível (-999) para os últimos ~33 dias do arquivo (01/04/2026 a 01/05/2026) — isso é uma limitação normal de latência do produto CERES, que demora mais para ser processado do que os campos meteorológicos do MERRA-2.

• Arquivo "gemeo_digital_goiania_solar_calculado.csv": série horária de previsão/estimativa para 29/04/2026 a 29/05/2026 num ponto vizinho (lat -16,7005; lon -49,2490), já trazendo a irradiação diária do Atlas Brasileiro de Energia Solar (valor fixo por mês: 5.120 Wh/m²/dia em abril e 5.024 Wh/m²/dia em maio) e as especificações de 3 tipos de painel.

• Os dois arquivos NÃO são do mesmo ponto nem do mesmo modelo (a pressão de superfície difere sistematicamente ~1,6 kPa entre eles, por exemplo), então foram tratados como duas fontes complementares na linha do tempo, e não como duplicatas a serem cruzadas linha a linha.

2. Construção da série única (aba Dados_Horarios)

• Linha do tempo contínua e horária de 01/05/2025 00h a 29/05/2026 23h = 394 dias × 24 h = 9.456 linhas, sem lacunas.

• Para cada hora, meteorologia (T2M, umidade, vento, pressão): usa NASA POWER quando disponível (01/05/2025–29/04/2026); usa a previsão do arquivo "gemeo" quando só ela existe (30/04/2026–29/05/2026). Três dias de previsão (17–19/05/2026) vieram sem meteorologia no arquivo original e foram preenchidos com a média horária climatológica do restante de maio do mesmo arquivo (linhas marcadas como PREVISAO_GEMEO_GAPFILL na coluna Fonte_Meteo).

• Umidade relativa (RH2M, %): a NASA POWER só fornece umidade específica (QV2M, g/kg). Para as horas de origem NASA, a umidade relativa foi calculada a partir de QV2M, T2M e PS pela equação psicrométrica padrão (pressão de saturação de vapor — Tetens/FAO-56): es = 0,6108·exp(17,27·T/(T+237,3));  e = q·P/(0,622+0,378·q);  UR = 100·e/es.

• Irradiância horária (GHI, Wh/m²): usa o valor medido da NASA POWER quando disponível (marcado MEDIDA_NASA_POWER). Quando ausente (-999 na NASA, ou período exclusivo da previsão), usa o total diário do Atlas Brasileiro de Energia Solar (5.120 ou 5.024 Wh/m²/dia, conforme o mês) distribuído hora a hora proporcionalmente à elevação solar do Sol em Goiânia naquele dia/hora (ângulo horário, declinação solar e equação do tempo padrão), preservando o total diário e dando o formato realista de curva (zero à noite, pico ao meio-dia solar). Essas horas são marcadas como ESTIMADA_ATLAS_CLIMATOLOGICO.

3. Modelo de desempenho fotovoltaico (aplicado às 9.456 horas, para os 3 tipos de painel)

• Temperatura de célula (modelo NOCT):  T_cel = T2M + (NOCT − 20) / 800 × GHI

• Fator de derating térmico:  Fator_Temp = 1 + γ × (T_cel − T_ref)

• Potência DC gerada:  P_DC (W) = P_pico (W) × (GHI / 1000) × Fator_Temp

• Potência real entregue (após perdas de sistema):  P_real (W) = P_DC × PR  (Performance Ratio)

• Parâmetros assumidos (ajustáveis na aba Parametros): NOCT = 45 °C; γ = −0,40 %/°C (silício cristalino padrão); T_ref = 25 °C (STC); PR = 80% (perdas típicas de inversor, cabeamento, sujidade e descasamento — valor típico de mercado para sistemas bem instalados, 75–85%).

• Como a base é horária, 1 Wh = 1 W médio na hora — por isso P_real_W de cada linha já corresponde à energia gerada naquela hora em Wh, permitindo somar diretamente para totais diários/mensais.

4. Especificação dos 3 painéis (parâmetros do arquivo "gemeo", preservados)

• 60 células: área 1,65 m² | eficiência 22% | potência de pico 360 Wp

• 72 células: área 2,00 m² | eficiência 22% | potência de pico 440 Wp

• Painel moderno (alta densidade): área 3,10 m² | eficiência 22% | potência de pico 682 Wp

5. Estrutura do arquivo

• Parametros — todas as constantes do modelo e dos painéis (células azuis = editáveis; alterar aqui recalcula a planilha inteira).

• Dados_Horarios — as 9.456 linhas horárias com meteorologia, irradiância e potência calculada dos 3 painéis (fórmulas vivas, referenciando a aba Parametros).

• Resumo_Diario — energia diária (kWh) e indicadores por painel, um dia por linha (394 dias).

• Resumo_Mensal — energia mensal, fator de capacidade e performance ratio efetivo, com gráfico.

6. Avisos importantes

• Os dados de 30/04/2026 em diante (toda a previsão do arquivo "gemeo") são uma estimativa/previsão climatológica, não uma medição — adequados para simulação do gêmeo digital, não para faturamento.

• Este é um modelo simplificado de engenharia (não substitui um estudo de performance certificado PVsyst/SAM); sombreamento, sujidade variável, degradação anual e curva I-V detalhada não são modelados.