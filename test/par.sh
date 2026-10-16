#!/bin/sh
# uso: test/par.sh pasta_saida arquivos...  — roda o teste em lote em paralelo (6 por vez)
out=$1; shift; mkdir -p "$out"
for f in "$@"; do echo "$f"; done | xargs -P 6 -I{} sh -c 'n=$(basename {} .pdf); timeout 240 node test/batch.js {} --json '"$out"'/$n.json > '"$out"'/$n.txt 2>&1 || echo "$n TIMEOUT/ERRO" >> '"$out"'/_falhas.txt'
for f in "$@"; do n=$(basename "$f" .pdf); grep -h "^$n.pdf" "$out/$n.txt" 2>/dev/null || echo "$n.pdf  (sem saída)"; done
cat "$out/_falhas.txt" 2>/dev/null
