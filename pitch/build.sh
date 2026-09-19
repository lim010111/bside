#!/usr/bin/env bash
# deck.html → 발표자료(본편) + 백업, 각각 PDF와 PPTX
# 크롬과 python-pptx가 필요하다.  실행: bash build.sh
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
PNG="$HERE/.build"
DECK="file:///$(echo "$HERE/deck.html" | sed 's|^/\([a-z]\)/|\1:/|')"

CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "크롬을 찾지 못했다. CHROME=<경로> 로 지정할 것"; exit 1; }

# 섹션 태그만 센다. data-backup 은 JS 필터에도 나오므로 <section 으로 묶어서 찾는다
TOTAL=$(grep -c '<section class="slide' "$HERE/deck.html")
BACKUP=$(grep -c '<section class="slide" data-backup>' "$HERE/deck.html")
MAIN=$((TOTAL - BACKUP))

# 구조 검사 — 태그가 어긋나면 슬라이드 밖으로 요소가 새어나간다
python "$HERE/check.py" "$HERE/deck.html"

rm -rf "$PNG"; mkdir -p "$PNG/main" "$PNG/backup"

render () {          # render <only> <장수> <폴더>
  local only="$1" count="$2" dir="$3"
  echo "$only $count장 렌더링"
  for n in $(seq 1 "$count"); do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=2 --window-size=1280,720 \
      --virtual-time-budget=6000 \
      --screenshot="$PNG/$dir/slide-$(printf '%02d' "$n").png" \
      "$DECK?only=$only&s=$n" >/dev/null 2>&1
  done
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
    --virtual-time-budget=8000 \
    --print-to-pdf="$HERE/$4" "$DECK?only=$only" >/dev/null 2>&1
}

render main   "$MAIN"   main   "Bside_발표자료.pdf"
render backup "$BACKUP" backup "Bside_백업.pdf"

echo "PPTX"
python - "$PNG" "$HERE" <<'PY'
import glob, os, sys
from pptx import Presentation
from pptx.util import Inches

src, out = sys.argv[1], sys.argv[2]

notes = {
 "main": {
  1:"0:00–0:05 표지. 팀명 확정되면 TEAM ○ 교체.",
  2:"0:05–0:50 문제. 페르소나로 구체화. 여기를 가장 세게 판다.",
  3:"0:50–1:20 문제의 정체. 15%를 크게 말하고 58/39로 못 박는다.",
  4:"1:20–1:30 동작 5단계. 빠르게 읽고 넘어간다.",
  5:"1:30–2:50 시연 영상 80초. 영상 파일을 이 장에 임베드할 것.",
  6:"2:50–3:30 상보성. 이 발표의 최고점. 겹치는 단어 0개를 반드시 소리내어 말한다.",
  7:"3:30–3:55 기술. LLM 경계선 + GPS 안 씀 + DB 없음.",
  8:"3:55–4:15 만든 것. 한계를 먼저 인정하는 게 점수에 유리하다.",
  9:"4:15–4:45 사업화. 지불자가 주최자라는 것과 지표 전환.",
  10:"4:45–5:00 마무리.",
 },
 "backup": {
  1:"Brella·Swapcard 질문용.",
  2:"근거리 소셜 부검 질문용.",
  3:"접점 없을 때 질문용.",
  4:"안전 질문용.",
  5:"확장 질문용.",
 },
}

for kind, name in (("main", "Bside_발표자료.pptx"), ("backup", "Bside_백업.pptx")):
    pngs = sorted(glob.glob(os.path.join(src, kind, "slide-*.png")))
    if not pngs:
        raise SystemExit(f"{kind} PNG가 없다")
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    blank = prs.slide_layouts[6]
    for i, p in enumerate(pngs, start=1):
        s = prs.slides.add_slide(blank)
        s.shapes.add_picture(p, 0, 0, width=prs.slide_width, height=prs.slide_height)
        if i in notes[kind]:
            s.notes_slide.notes_text_frame.text = notes[kind][i]
    prs.save(os.path.join(out, name))
    print(f"  {name} {len(pngs)}장")
PY

echo "끝. $HERE 를 볼 것"
