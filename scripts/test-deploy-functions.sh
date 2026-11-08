#!/usr/bin/env bash
# deploy-functions.sh 판정 시험 — 가짜 firebase 로 다섯 경우. 실행: bash scripts/test-deploy-functions.sh
set -u
D="$(cd "$(dirname "$0")" && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
E=$'\x1b'
fake() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$T/$1"; chmod +x "$T/$1"; }
# 실제 로그처럼 색 코드가 섞인 줄
fake selfheal "echo '⚠  functions:  failed to update function projects/p/locations/r/functions/a'; echo '${E}[32m✔ ${E}[39m functions[a(asia-northeast3)]${E}[22m${E}[39m Successful update operation.'; echo x >> \"\$T_CALLS\"; exit 0"
fake stuck "echo '⚠  functions:  failed to update function projects/p/locations/r/functions/a'; exit 0"
fake flaky "c=\$(cat \"\$T_STATE\" 2>/dev/null || echo 0); echo \$((c+1)) > \"\$T_STATE\"; [ \"\$c\" = 0 ] && echo '⚠  functions:  failed to update function projects/p/locations/r/functions/a'; exit 0"
fake clean "echo '✔ functions[a(asia-northeast3)] Successful update operation.'; exit 0"
fake crash "echo boom; exit 2"
fails=0
check() { local want=$1 name=$2; shift 2; env "$@" DEPLOY_RETRY_WAIT=0 bash "$D/deploy-functions.sh" >/dev/null 2>&1; local rc=$?; if [ "$rc" = "$want" ]; then echo "PASS $name (rc=$rc)"; else echo "FAIL $name (rc=$rc, 기대 $want)"; fails=$((fails+1)); fi; }
check 0 "CLI 가 스스로 재시도해 성공(색 코드 섞임) — 재배포 안 함" FIREBASE_BIN="$T/selfheal" T_CALLS="$T/calls"
[ "$(wc -l < "$T/calls" | tr -d ' ')" = 1 ] && echo "PASS 헛재배포 0" || { echo "FAIL 헛재배포 $(wc -l < "$T/calls")"; fails=$((fails+1)); }
check 1 "끝까지 실패 → 빨강" FIREBASE_BIN="$T/stuck"
check 0 "한 번 실패 → 그것만 다시 → 초록" FIREBASE_BIN="$T/flaky" T_STATE="$T/state"
check 0 "깨끗한 배포" FIREBASE_BIN="$T/clean"
check 2 "CLI 자체 오류는 그 코드로" FIREBASE_BIN="$T/crash"
[ $fails = 0 ] && echo "DEPLOY-FUNCTIONS TEST PASS" || { echo "DEPLOY-FUNCTIONS TEST FAIL $fails"; exit 1; }
