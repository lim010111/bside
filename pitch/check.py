"""deck.html 구조 검사.

태그가 어긋나면 슬라이드 밖으로 요소가 새어나가고, #stage에 붙어
모든 장에 겹쳐 찍힌다. 눈으로는 작은 얼룩으로만 보여서 놓치기 쉽다.
"""
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = sys.argv[1] if len(sys.argv) > 1 else "deck.html"
src = open(path, encoding="utf-8").read()
body = src[src.index('<div id="stage">'):src.index('<div id="rail">')]

sections = re.findall(r'<section class="slide.*?</section>', body, re.S)
bad = []
for i, sec in enumerate(sections, 1):
    for tag in ("div", "figure"):
        if len(re.findall(rf"<{tag}\b", sec)) != len(re.findall(rf"</{tag}>", sec)):
            bad.append(f"{i}장 {tag}")

n_open = len(re.findall(r"<section\b", body))
n_close = len(re.findall(r"</section>", body))

# 슬라이드 밖에 떠 있는 요소 — 위 버그의 직접적인 증상
stray = re.sub(r'<section class="slide.*?</section>', "", body, flags=re.S)
stray = re.sub(r"<!--.*?-->", "", stray, flags=re.S)
stray_tags = re.findall(r"<(?!/|div id=\"stage\"|div id=\"frame\")[a-z]+", stray)

if bad or n_open != n_close or stray_tags:
    print(f"태그 불균형 {bad} · section {n_open}/{n_close} · 슬라이드 밖 요소 {stray_tags}")
    sys.exit(1)

print(f"구조 검사 통과: {n_open}장")
