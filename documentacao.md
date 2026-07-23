# TODO - Correção dos dados climáticos nos gráficos

- [ ] Diagnosticar mismatch de datas entre `ceagesp.data` e `clima_diario.data` (formatos/substring/timestamp).
- [ ] Garantir que as colunas climáticas corretas estão sendo lidas (`temperatura` e `chuva`).
- [ ] Implementar normalização única de datas (converter para YYYY-MM-DD) para ambos conjuntos.
- [ ] Adicionar contadores/debug temporários para validar quantos matches ocorreram.
- [ ] Regerar scatter usando os dados já normalizados.
- [ ] Validar que os pontos aparecem e que os gráficos carregam com dados.

