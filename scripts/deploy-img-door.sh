#!/usr/bin/env bash
# 그림 문(alchan-img.pages.dev) — Firebase Hosting 의 /images/** · /avatar-shop/** 를 301 로 여기로 넘긴다(firebase.json redirects).
# 왜(2026-11-12 사용자 «둘다 모두 그런방식으로» · 선행쌤 예산 알림의 같은 처방): Firebase 무료 전송 = 하루 360MB.
#   Cloudflare Pages 정적 전송은 무료·무제한(korea 계정). 학교 망에서 pages.dev 는 열린다(게임 70여 개).
# 그림을 바꾸거나 더하면 build 후 이걸 먼저 돌린다 — CI 배포 전 scripts/check-img-door.mjs 가 빠진 그림을 막는다.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d build/images ] || { echo "❌ build/images 없음 — 먼저 npm run build"; exit 1; }
D=.img-door; rm -rf "$D"; mkdir -p "$D"
cp -R build/images build/avatar-shop "$D/"
printf '/*\n  Cache-Control: public, max-age=86400\n  Access-Control-Allow-Origin: *\n' > "$D/_headers"
printf '<!doctype html><meta charset="utf-8"><title>알찬 그림</title>\n' > "$D/index.html"
printf 'not found\n' > "$D/404.html"   # 없으면 Pages 가 없는 그림에도 첫 페이지를 200 으로 준다(검사가 속는다)
W() { env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=b3d436cfca3fb9f2d1d7af777e23e8f1 HOME="$HOME/.cf-homes/korea" npx -y wrangler@4.83.0 "$@"; }
W whoami 2>&1 | grep -q b3d436cfca3fb9f2d1d7af777e23e8f1 || { echo "❌ korea 계정 로그인이 아니다"; exit 3; }
W pages project list 2>/dev/null | grep -q 'alchan-img' || W pages project create alchan-img --production-branch main
# 그림 폴더 안에서 올린다 — 저장소 맨 위 functions/(Firebase 함수)를 wrangler 가 Pages 함수로 빌드하려다 56개 오류로 죽었다(2026-11-12)
(cd "$D" && W pages deploy "$PWD" --project-name alchan-img --branch main --commit-dirty=true 2>&1 | grep -E "Deployment complete|rror" || true)
for i in $(seq 1 20); do node scripts/check-img-door.mjs >/dev/null 2>&1 && { node scripts/check-img-door.mjs; exit 0; }; sleep 3; done
node scripts/check-img-door.mjs
