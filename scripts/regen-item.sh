#!/bin/bash
# 단일 아바타 아이템 표준 재생성 워크플로우
#
# 사용법:
#   ./scripts/regen-item.sh <item_id1> [item_id2] [item_id3] ...
#   ./scripts/regen-item.sh hat_graduation
#   ./scripts/regen-item.sh glasses_aviator glasses_eyepatch
#
# 동작:
#   1. ps로 다른 codex 프로세스 확인
#   2. 단독 호출 (parallel=1) 순차 진행
#   3. 자동 검증 (validate-asset.mjs)
#   4. 후처리 (safe-strip-white + strip-black-rect)
#   5. cache-buster 자동 bump (v=YYYYMMDD<a-z> → 다음 letter)
#   6. npm run build → git add/commit/push

set -e
cd "$(dirname "$0")/.."

if [ "$#" -eq 0 ]; then
  echo "사용법: $0 <item_id> [item_id2] ..."
  exit 1
fi

IDS=("$@")
EDITOR_HTML="public/avatar-position-editor.html"

# ============================================================================
# 1. 다른 codex 프로세스 확인 (race condition 방지)
# ============================================================================
echo "🔍 다른 codex 프로세스 확인..."
OTHER_CODEX=$(ps aux | grep "codex exec" | grep -v grep | grep -v "alchan" | head -3 || true)
if [ -n "$OTHER_CODEX" ]; then
  echo "⚠️  다른 프로젝트 codex 실행 중 — race 위험"
  echo "$OTHER_CODEX" | head -3
  echo "계속하려면 5초 후 진행. 중단하려면 Ctrl+C."
  sleep 5
fi

# ============================================================================
# 2. 각 아이템 단독 호출
# ============================================================================
for id in "${IDS[@]}"; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎨 $id 생성 시작"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  node scripts/generate-avatar-images.mjs --id="$id" --parallel=1
  if [ ! -f "public/avatar-shop/${id}.png" ]; then
    echo "❌ $id PNG 생성 실패"
    exit 1
  fi
done

# ============================================================================
# 3. 자동 검증
# ============================================================================
echo ""
echo "🧪 자동 검증..."
FAILED_IDS=()
for id in "${IDS[@]}"; do
  if ! node scripts/validate-asset.mjs --id="$id"; then
    FAILED_IDS+=("$id")
  fi
done

if [ "${#FAILED_IDS[@]}" -gt 0 ]; then
  echo ""
  echo "⚠️  검증 실패 — codex prompt 위반 가능:"
  printf '   - %s\n' "${FAILED_IDS[@]}"
  echo "카탈로그 prompt 강화 후 재시도 권장."
  echo "(계속하려면 5초 후 진행)"
  sleep 5
fi

# ============================================================================
# 4. 후처리 (safe-strip-white + strip-black-rect)
# ============================================================================
echo ""
echo "🧹 후처리..."
node scripts/safe-strip-white.mjs 2>&1 | tail -25
node scripts/strip-black-rect.mjs 2>&1 | grep -E "$(IFS='|'; echo "${IDS[*]}")" || true

# ============================================================================
# 5. cache-buster 자동 bump
# ============================================================================
CURRENT_BUSTER=$(grep -oE "v=20[0-9]{6}[a-z]" "$EDITOR_HTML" | head -1 || echo "")
if [ -n "$CURRENT_BUSTER" ]; then
  TODAY=$(date +%Y%m%d)
  LETTER=${CURRENT_BUSTER: -1}
  PREFIX="v=$TODAY"
  if [[ "$CURRENT_BUSTER" == "v=$TODAY"* ]]; then
    NEXT_LETTER=$(echo "$LETTER" | tr 'a-y' 'b-z')
    NEW_BUSTER="$PREFIX$NEXT_LETTER"
  else
    NEW_BUSTER="${PREFIX}a"
  fi
  echo ""
  echo "🔄 cache-buster: $CURRENT_BUSTER → $NEW_BUSTER"
  sed -i '' "s|$CURRENT_BUSTER|$NEW_BUSTER|g" "$EDITOR_HTML"
fi

# ============================================================================
# 6. build → commit → push
# ============================================================================
echo ""
echo "🏗  build..."
npm run build 2>&1 | tail -5

echo ""
echo "📝 git add/commit/push..."
FILES_TO_ADD=("$EDITOR_HTML" "src/data/avatarShopCatalog.js")
for id in "${IDS[@]}"; do
  FILES_TO_ADD+=("public/avatar-shop/${id}.png")
done
git add "${FILES_TO_ADD[@]}"

# CRITICAL: deploy.yml은 build/** 변경 시만 트리거. build/ 안 넣으면 push 해도 배포 안 됨.
git add build/

ID_LIST=$(IFS=,; echo "${IDS[*]}")
git commit -m "fix(avatar): $ID_LIST 재생성

- 단독 호출 (parallel=1, race 회피)
- 자동 검증 통과
- cache-buster $NEW_BUSTER" || echo "(변경 없음)"

git push origin main

echo ""
echo "✅ 완료. 사용자 강력 새로고침(Cmd+Shift+R) 필요."
