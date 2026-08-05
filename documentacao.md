# TODO - Correção dos dados climáticos nos gráficos

- [x] Diagnosticar mismatch de datas entre `ceagesp.data` e `clima_diario.data` (formatos/substring/timestamp).
- [x] Garantir que as colunas climáticas corretas estão sendo lidas (`temperatura` e `chuva`).
- [x] Implementar normalização única de datas (converter para YYYY-MM-DD) para ambos conjuntos.
- [x] Adicionar contadores/debug temporários para validar quantos matches ocorreram.
- [x] Regerar scatter usando os dados já normalizados.
- [x] Validar que os pontos aparecem e que os gráficos carregam com dados.

