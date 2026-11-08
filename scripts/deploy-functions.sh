#!/usr/bin/env bash
# 함수 배포 — 일부가 «failed to update»(주로 Quota Exceeded)여도 firebase CLI 는 0 으로 끝난다.
# 2026-11-08 자동 물가 배포: 33개가 옛 버전에 남았는데 워크플로는 초록이었다. 그래서
#   ① 실패한 함수 이름을 로그에서 모아 ② 그것만 기다렸다 다시 배포(최대 3번) ③ 끝까지 남으면 1 로 끝낸다.
# 사용: scripts/deploy-functions.sh <firebase 인자…>   (예: --project P --token T --non-interactive)
#   FIREBASE_BIN(기본 firebase)·DEPLOY_RETRY_WAIT(기본 90초)·DEPLOY_RETRIES(기본 3)는 시험용으로 바꿀 수 있다.
set -uo pipefail
FB="${FIREBASE_BIN:-firebase}"; WAIT="${DEPLOY_RETRY_WAIT:-90}"; TRIES="${DEPLOY_RETRIES:-3}"
LOG="$(mktemp)"; trap 'rm -f "$LOG"' EXIT
failed_of() { grep -oE 'failed to (create|update|deploy) function [^ ]*functions/[A-Za-z0-9_-]+' "$1" | sed -E 's#.*functions/##' | sort -u; }
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
