#!/bin/bash
# 세금 정산표 빈 양식(이름 칸 비움) — 함께글 엔진(rhwp)으로 만든다
# 다시 만들기: bash scripts/forms/tax-sheet-build.sh  (함께글 rhwp 바이너리 필요 — 경로는 R=)
#   칸 비율(번호 좁게·이름·같은 폭 금액 15칸)과 0.4mm 선은 자동 이름 가리기(src/utils/nameMask.js)가 기대는 무늬다 — 바꾸면 e2e·name-mask-browser 로 다시 잴 것.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
R=${RHWP:-~/Documents/dev/한글/spike/vendor/rhwp/target/release/rhwp}
D=${OUT:-$(mktemp -d)}
RUN=$D/run-$(date +%s)
mkdir -p "$RUN/x" && cd "$RUN"
(cd "$RUN/x" && unzip -oq "$HERE/tax-sheet-base.hwpx")
# 1) 가로 용지(NARROWLY=가로) + 여백 10mm·8mm
sed -i '' 's/<hp:pagePr landscape="WIDELY"/<hp:pagePr landscape="NARROWLY"/; s/<hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"\/>/<hp:margin header="1417" footer="1417" gutter="0" left="2835" right="2835" top="2268" bottom="2268"\/>/' "$RUN/x/Contents/section0.xml"
(cd "$RUN/x" && zip -X0q "$RUN/land.hwpx" mimetype && zip -X9rq "$RUN/land.hwpx" . -x mimetype)
f=$RUN/land.hwpx
n=0
step() { n=$((n+1)); local out=$RUN/t$n.hwpx; "$R" edit "$@" -o "$out" >/dev/null; f=$out; }
step insert-text "$f" --text "세금 정산표      (      월      주)" --section 0 --para 0 --offset 0
step insert-paragraph "$f" --section 0 --para 1
# 2) 표: 머리행 2 + 25명, 17칸 (번호 11mm · 이름 22mm · 금액 15칸 16.3mm) — 합 277mm
W="3118,6236"; for i in $(seq 1 15); do W="$W,4611"; done
A=$(for i in $(seq 1 17); do printf 'center,'; done | sed 's/,$//')
step insert-table "$f" --rows 27 --cols 17 --section 0 --para 1 --offset 0 --widths "$W" --alignments "$A"
step merge-cells "$f" --table 0 --row 0 --col 0 --end-row 1 --end-col 0
step merge-cells "$f" --table 0 --row 0 --col 1 --end-row 1 --end-col 1
for d in 0 1 2 3 4; do c=$((2+d*3)); step merge-cells "$f" --table 0 --row 0 --col $c --end-row 0 --end-col $((c+2)); done
step set-cell "$f" --table 0 --row 0 --col 0 --text "번호"
step set-cell "$f" --table 0 --row 0 --col 1 --text "이름"
days=(월 화 수 목 금)
for d in 0 1 2 3 4; do c=$((2+d*3))
  step set-cell "$f" --table 0 --row 0 --col $c --text "${days[$d]}"
  step set-cell "$f" --table 0 --row 1 --col $c --text "벌금"
  step set-cell "$f" --table 0 --row 1 --col $((c+1)) --text "상금"
  step set-cell "$f" --table 0 --row 1 --col $((c+2)) --text "쿠폰"
done
for r in $(seq 1 25); do step set-cell "$f" --table 0 --row $((r+1)) --col 0 --text "$r"; done
cp "$f" "$D/built.hwpx"; python3 "$HERE/tax-sheet-post.py" "$D/built.hwpx" "$D/tax-sheet.hwpx"; "$R" convert "$D/tax-sheet.hwpx" "$D/tax-sheet.hwp" --verify --verify-pages; echo "→ $D/tax-sheet.hwp·.hwpx 를 public/forms/ 로 복사"
