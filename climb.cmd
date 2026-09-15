@echo off
REM ============================================================
REM  CLImb - liga a sessao de trabalho (PC + celular)
REM
REM  POR QUE ESTE ARQUIVO: `claude --remote-control` sozinho abre uma
REM  conversa NOVA toda vez, com contexto zerado. O `--continue` retoma a
REM  conversa mais recente DESTA PASTA, que fica gravada em disco
REM  (~/.claude/projects/...). Ou seja: pode desligar o PC a vontade - o
REM  contexto volta no dia seguinte.
REM
REM  USO: clique duas vezes neste arquivo, ou rode `climb` no terminal.
REM       Para encerrar, feche a janela (ou /exit dentro da sessao).
REM ============================================================

cd /d "%~dp0"

echo.
echo  CLImb - retomando a conversa mais recente desta pasta...
echo  (Remote Control ligado como "climb-pc" - alcancavel pelo celular)
echo.

REM Tenta retomar. Se nao houver conversa anterior (primeira vez na pasta),
REM o --continue falha e caimos no arranque limpo.
claude --continue --model opus --fallback-model sonnet --remote-control climb-pc

if errorlevel 1 (
  echo.
  echo  Nao havia conversa anterior aqui. Comecando uma nova...
  echo.
  claude --model opus --fallback-model sonnet --remote-control climb-pc
)
