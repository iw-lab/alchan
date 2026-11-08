#!/usr/bin/env bash
# 함수 배포 — 일부가 «failed to update»(주로 Quota Exceeded)여도 firebase CLI 는 0 으로 끝난다.
# (CLI 스스로의 재시도로 결국 성공한 함수는 실패로 세지 않는다 — 아래 failed_of.) 끝까지 실패한 함수만
#   ① 모아 ② 그것만 기다렸다 다시 배포(최대 3번) ③ 끝까지 남으면 1 로 끝낸다 — CLI 는 그래도 0 으로 끝나기 때문이다.
# 사용: scripts/deploy-functions.sh <firebase 인자…>   (예: --project P --token T --non-interactive)
#   FIREBASE_BIN(기본 firebase)·DEPLOY_RETRY_WAIT(기본 90초)·DEPLOY_RETRIES(기본 3)는 시험용으로 바꿀 수 있다.
set -uo pipefail
FB="${FIREBASE_BIN:-firebase}"; WAIT="${DEPLOY_RETRY_WAIT:-90}"; TRIES="${DEPLOY_RETRIES:-3}"
LOG="$(mktemp)"; trap 'rm -f "$LOG"' EXIT
# 실패 = «failed to …» 가 찍혔는데 **성공 줄이 없는** 함수. CLI 는 Quota Exceeded 에 «failed to update … Waiting to retry»를 찍고
#   스스로 다시 해 대개 성공한다(2026-11-08 실측: 실패 문구 33개 → 전부 «Successful update operation»). 문구만 세면 헛재배포·헛빨강이 난다.
failed_of() {
  local bad ok plain
  plain="$(mktemp)"; sed -E $'s/\x1b\\[[0-9;]*m//g' "$1" > "$plain"   # 실제 로그엔 색 코드가 섞여 «]…Successful» 이 안 맞는다
  set -- "$plain"
  bad="$(grep -oE 'failed to (create|update|deploy) function [^ ]*functions/[A-Za-z0-9_-]+' "$1" | sed -E 's#.*functions/##' | sort -u)"
  ok="$(grep -oE 'functions\[[A-Za-z0-9_-]+\([a-z0-9-]+\)\][^A-Za-z]*Successful (create|update|delete) operation' "$1" | sed -E 's#functions\[([A-Za-z0-9_-]+)\(.*#\1#' | sort -u)"
  comm -23 <(echo "$bad" | sed '/^$/d') <(echo "$ok" | sed '/^$/d')
  rm -f "$plain"
}
"$FB" deploy --only functions "$@" 2>&1 | tee "$LOG"; rc=${PIPESTATUS[0]}
FAILED="$(failed_of "$LOG")"
for ((i = 1; i <= TRIES; i++)); do
  [ -z "$FAILED" ] && break
  n=$(echo "$FAILED" | wc -l | tr -d ' ')
  echo "⚠️ ${n}개 함수가 배포되지 않았다 — ${WAIT}초 뒤 그것만 다시(${i}/${TRIES}): $(echo $FAILED)"
  sleep "$WAIT"
  ONLY="$(echo "$FAILED" | sed 's/^/functions:/' | paste -sd, -)"
  "$FB" deploy --only "$ONLY" "$@" 2>&1 | tee "$LOG"; rc=${PIPESTATUS[0]}
  FAILED="$(failed_of "$LOG")"
done
if [ -n "$FAILED" ]; then echo "❌ 끝까지 배포되지 않은 함수: $(echo $FAILED) — 옛 버전이 돌고 있다"; exit 1; fi
[ "$rc" -ne 0 ] && { echo "❌ firebase deploy 종료코드 $rc"; exit "$rc"; }
echo "✅ 함수 전부 배포됨"
