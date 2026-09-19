import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

# 16:9 와이드스크린 프레젠테이션 생성
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank_slide_layout = prs.slide_layouts[6]

# 색상 팔레트
BG_COLOR = RGBColor(9, 13, 22)         # #090d16 깊은 다크
CARD_BG = RGBColor(17, 24, 39)         # #111827 카드 배경
CARD_BORDER = RGBColor(31, 41, 55)     # #1f2937 테두리
TEXT_WHITE = RGBColor(249, 250, 251)   # #f9fafb 본문 흰색
TEXT_MUTED = RGBColor(156, 163, 175)   # #9ca3af 서브 텍스트
ACCENT_GREEN = RGBColor(52, 211, 153)  # #34d399 에메랄드
ACCENT_BLUE = RGBColor(56, 189, 248)   # #38bdf8 시안 블루
ACCENT_PURPLE = RGBColor(167, 139, 250)# #a78bfa 인디고
ACCENT_RED = RGBColor(248, 113, 113)   # #f87171 코랄 레드

def set_slide_background(slide):
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = BG_COLOR

def add_header(slide, category, title, subtitle=None):
    # 상단 태그
    cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.4))
    tf_c = cat_box.text_frame
    tf_c.word_wrap = True
    p_c = tf_c.paragraphs[0]
    p_c.text = category.upper()
    p_c.font.size = Pt(11)
    p_c.font.bold = True
    p_c.font.color.rgb = ACCENT_GREEN

    # 메인 타이틀
    title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.85), Inches(11.7), Inches(0.7))
    tf_t = title_box.text_frame
    tf_t.word_wrap = True
    p_t = tf_t.paragraphs[0]
    p_t.text = title
    p_t.font.size = Pt(26)
    p_t.font.bold = True
    p_t.font.color.rgb = TEXT_WHITE

    if subtitle:
        p_sub = tf_t.add_paragraph()
        p_sub.text = subtitle
        p_sub.font.size = Pt(13)
        p_sub.font.color.rgb = TEXT_MUTED

def add_card(slide, left, top, width, height, title=None, title_color=ACCENT_BLUE):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = CARD_BG
    shape.line.color.rgb = CARD_BORDER
    shape.line.width = Pt(1)
    
    if title:
        tx_box = slide.shapes.add_textbox(left + Inches(0.25), top + Inches(0.2), width - Inches(0.5), Inches(0.4))
        p = tx_box.text_frame.paragraphs[0]
        p.text = title
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = title_color
    return shape

# ==========================================
# SLIDE 1: 표지 (Cover)
# ==========================================
s1 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s1)

box1 = s1.shapes.add_textbox(Inches(1.0), Inches(2.2), Inches(11.3), Inches(3.5))
tf1 = box1.text_frame
tf1.word_wrap = True

p = tf1.paragraphs[0]
p.text = "BSIDE"
p.font.size = Pt(54)
p.font.bold = True
p.font.color.rgb = ACCENT_GREEN

p2 = tf1.add_paragraph()
p2.text = "Connect with who's beside you."
p2.font.size = Pt(26)
p2.font.color.rgb = TEXT_WHITE
p2.space_before = Pt(10)

p3 = tf1.add_paragraph()
p3.text = "행사장에서 닿을 수 있는 거리에 있는 사람과 이어지는 상보성(相補性) AI 네트워킹"
p3.font.size = Pt(16)
p3.font.color.rgb = ACCENT_BLUE
p3.space_before = Pt(15)

p4 = tf1.add_paragraph()
p4.text = "코쓱톤 2026 연합 해커톤 · 주제: 교류 · 국민대 · 숭실대 · 순천향대"
p4.font.size = Pt(13)
p4.font.color.rgb = TEXT_MUTED
p4.space_before = Pt(30)


# ==========================================
# SLIDE 2: 문제 정의 (Problem)
# ==========================================
s2 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s2)
add_header(s2, "01. PROBLEM", "네트워킹 시간 30분, 왜 아무도 말을 걸지 못할까요?", "용기가 없어서가 아니라 '누구에게 왜 걸어야 할지' 모르기 때문입니다.")

c1 = add_card(s2, Inches(0.8), Inches(2.0), Inches(5.6), Inches(4.7), "혼자 온 참가자의 현실", ACCENT_RED)
tb1 = s2.shapes.add_textbox(Inches(1.05), Inches(2.7), Inches(5.1), Inches(3.8))
tf = tb1.text_frame
tf.word_wrap = True
lines1 = [
    "• 30분의 네트워킹 시간: 이미 아는 사람끼리 뭉침",
    "• 혼자 온 사람은 음료 테이블 옆에서 폰만 봄",
    "• 말을 걸고 싶어도 상대가 뭘 하는 사람인지 모름",
    "• 공통 관심사 찾으려다 어색한 침묵만 흐름",
    "• 명함 몇 장 교환하고 실질적 교류 없이 행사 종료"
]
for i, l in enumerate(lines1):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.text = l
    p.font.size = Pt(13)
    p.font.color.rgb = TEXT_WHITE
    p.space_after = Pt(14)

c2 = add_card(s2, Inches(6.8), Inches(2.0), Inches(5.7), Inches(4.7), "주최자 및 기존 솔루션의 한계", ACCENT_BLUE)
tb2 = s2.shapes.add_textbox(Inches(7.05), Inches(2.7), Inches(5.2), Inches(3.8))
tf = tb2.text_frame
tf.word_wrap = True
lines2 = [
    "• 주최자의 15%만 자사 네트워킹이 효과적이라 응답 (Converve 조사)",
    "• 전용 앱(Brella 등)을 깔게 해도 채택률 58%, 수락률 39%",
    "• 앱스토어 설치 + 긴 프로필 작성의 높은 진입장벽",
    "• '사전 예약형' 매칭은 현장의 즉흥적 교류를 지원 못함",
    "• 핵심 결론: 돈 내고 앱 깔게 해도 절반 이상이 안 쓴다"
]
for i, l in enumerate(lines2):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.text = l
    p.font.size = Pt(13)
    p.font.color.rgb = TEXT_WHITE
    p.space_after = Pt(14)


# ==========================================
# SLIDE 3: 해결책 (Solution)
# ==========================================
s3 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s3)
add_header(s3, "02. SOLUTION", "Bside: 설치 없이 3초 입장, 현실에서 만나는 상보성 교류", "30초 한 줄 상태 표시 → AI 상보성 매칭 → BLE 직접 대화 → 현실 만남")

steps = [
    ("1. QR로 3초 입장", "앱 설치 불필요. 현장 QR 찍으면 웹 브라우저에서 즉시 실행.", ACCENT_GREEN),
    ("2. 30초 한 줄 등록", "닉네임 + 소속 + 상태 4종 + '한 줄'을 올려야만 방이 열림(입장료).", ACCENT_BLUE),
    ("3. AI 상보성 매칭", "겹치는 단어 0개라도 '부족한 자'와 '해본 자'를 AI가 정밀 매칭.", ACCENT_PURPLE),
    ("4. BLE 직접 연결", "서버 없이 기기 간 P2P로 소통. '창가 쪽 손 들게요' 현실 만남.", ACCENT_GREEN),
]

for idx, (stitle, sdesc, scolor) in enumerate(steps):
    left = Inches(0.8 + idx * 2.95)
    add_card(s3, left, Inches(2.2), Inches(2.8), Inches(4.5), stitle, scolor)
    tb = s3.shapes.add_textbox(left + Inches(0.2), Inches(3.0), Inches(2.4), Inches(3.4))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = sdesc
    p.font.size = Pt(13)
    p.font.color.rgb = TEXT_WHITE
    p.space_after = Pt(12)


# ==========================================
# SLIDE 4: 핵심 차별점 (AI Asymmetric Matching)
# ==========================================
s4 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s4)
add_header(s4, "03. CORE INNOVATION", "왜 AI인가: 유사도가 아니라 상보성(相補性)을 찾는다", "공통 키워드 매칭은 둘 다 모르는 사람을 잇지만, Bside는 서로를 채워주는 사람을 잇습니다.")

# 대조 표
rows = 4
cols = 4
left = Inches(0.8)
top = Inches(2.2)
width = Inches(11.7)
height = Inches(2.2)

table_shape = s4.shapes.add_table(rows, cols, left, top, width, height)
table = table_shape.table
table.columns[0].width = Inches(1.8)
table.columns[1].width = Inches(3.3)
table.columns[2].width = Inches(3.3)
table.columns[3].width = Inches(3.3)

headers = ["구분", "지원 (LOOKING_FOR)", "태현 (FIRST_TIME)", "민서 (CAN_SHARE)"]
for col_idx, text in enumerate(headers):
    cell = table.cell(0, col_idx)
    cell.fill.solid()
    cell.fill.fore_color.rgb = CARD_BG
    p = cell.text_frame.paragraphs[0]
    p.text = text
    p.font.bold = True
    p.font.size = Pt(12)
    p.font.color.rgb = ACCENT_BLUE

data = [
    ["작성한 한 줄", "배포·CI 경험 있으신 분 찾아요", "배포가 처음이라 막막해요", "작년에 도커로 CI 구축해봤어요"],
    ["공통 단어", "기준 (배포, CI)", "배포 (1개 일치)", "0개 (완전 불일치)"],
    ["기존 키워드 매칭", "-", "지원 ↔ 태현 매칭 ❌", "지원 ↔ 민서 탈락 ❌"]
]

for row_idx, row_data in enumerate(data):
    for col_idx, text in enumerate(row_data):
        cell = table.cell(row_idx + 1, col_idx)
        cell.fill.solid()
        cell.fill.fore_color.rgb = RGBColor(15, 23, 42)
        p = cell.text_frame.paragraphs[0]
        p.text = text
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_WHITE

# 하단 결론 박스
add_card(s4, Inches(0.8), Inches(4.7), Inches(5.7), Inches(2.0), "기존 유사도 매칭의 치명적 한계", ACCENT_RED)
tb = s4.shapes.add_textbox(Inches(1.0), Inches(5.3), Inches(5.3), Inches(1.2))
p = tb.text_frame.paragraphs[0]
p.text = "• '배포'라는 단어가 겹친다고 지원과 태현을 묶음\n• 결과: 둘 다 배포를 몰라 만나서 한숨만 쉼 ❌\n• 단순 단어 임베딩/검색은 '상보적 결핍'을 해석 못함"
p.font.size = Pt(12)
p.font.color.rgb = TEXT_WHITE

add_card(s4, Inches(6.8), Inches(4.7), Inches(5.7), Inches(2.0), "Bside LLM 상보성 매칭 (ASYMMETRIC_HELP)", ACCENT_GREEN)
tb = s4.shapes.add_textbox(Inches(7.0), Inches(5.3), Inches(5.3), Inches(1.2))
p = tb.text_frame.paragraphs[0]
p.text = "• 겹치는 단어 0개: '오류로 막힘' ↔ '작년에 구축해봄'\n• LLM이 의미적 해결 관계를 추론해 완벽한 매칭 성사 ✅\n• 추천 첫마디까지 자동 생성: '혹시 CI 해보셨다고 들었는데...'"
p.font.size = Pt(12)
p.font.color.rgb = TEXT_WHITE


# ==========================================
# SLIDE 5: 시연 시나리오 (Demo 8-Cut)
# ==========================================
s5 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s5)
add_header(s5, "04. SERVICE FLOW", "80초 시연 워크플로우: 방 입장부터 만남까지", "실제 동작 중인 React + FastAPI 서비스 화면 흐름")

cuts = [
    ("1. 한 화면 입장", "인원수와 색 띠는 보이되 남의 한 줄은 블러 처리. '올려야 열린다'는 참여 규칙."),
    ("2. 46명 군중 방", "입장 즉시 시간순 정렬된 46명 목록 오픈. 카드 밑 5분 만료 실선 라이브 동작."),
    ("3. 1.5초 접점 시트", "AI가 '민서'님과의 상보성을 감지해 팝업 오픈. 왜 이어드렸나 도표 + 추천 첫마디."),
    ("4. BLE 직접 채팅", "서버를 거치지 않는 기기 간 직접 연결. '창가 쪽에 있어요' 3마디 후 현실 악수.")
]

for idx, (ctitle, cdesc) in enumerate(cuts):
    col = idx % 2
    row = idx // 2
    left = Inches(0.8 + col * 6.0)
    top = Inches(2.2 + row * 2.4)
    add_card(s5, left, top, Inches(5.7), Inches(2.1), ctitle, ACCENT_BLUE)
    tb = s5.shapes.add_textbox(left + Inches(0.2), top + Inches(0.8), Inches(5.3), Inches(1.1))
    p = tb.text_frame.paragraphs[0]
    p.text = cdesc
    p.font.size = Pt(12)
    p.font.color.rgb = TEXT_WHITE


# ==========================================
# SLIDE 6: 기술 아키텍처 & 프라이버시 (Architecture)
# ==========================================
s6 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s6)
add_header(s6, "05. ARCHITECTURE", "GPS 없는 근접 판정, DB 없는 인메모리 프라이버시", "서버에 올라갈 좌표 자체가 없으며, 행사가 끝나면 모든 데이터는 0으로 소멸합니다.")

add_card(s6, Inches(0.8), Inches(2.2), Inches(5.7), Inches(4.5), "왜 GPS가 아니라 BLE인가?", ACCENT_GREEN)
tb = s6.shapes.add_textbox(Inches(1.05), Inches(2.9), Inches(5.2), Inches(3.6))
tf = tb.text_frame
tf.word_wrap = True
lines_ble = [
    "• GPS는 내 좌표가 서버로 올라감 → 위치정보법 및 사생활 침해",
    "• BLE는 내 폰의 전파 범위(3~5m) 안의 사람만 폰 내부에서 계산",
    "• 서버는 참가자가 어디 있는지 좌표 자체를 알 수 없음",
    "• 근접 ID 해석도 기기 안에서 수행 (서버에 '누구 옆에 있냐' 안 물음)",
    "• 웹(iOS/PC)은 QR로 입장, 안드로이드는 Capacitor로 BLE 지원"
]
for i, l in enumerate(lines_ble):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.text = l
    p.font.size = Pt(12)
    p.font.color.rgb = TEXT_WHITE
    p.space_after = Pt(12)

add_card(s6, Inches(6.8), Inches(2.2), Inches(5.7), Inches(4.5), "No-DB 인메모리 아키텍처", ACCENT_PURPLE)
tb2 = s6.shapes.add_textbox(Inches(7.05), Inches(2.9), Inches(5.2), Inches(3.6))
tf2 = tb2.text_frame
tf2.word_wrap = True
lines_db = [
    "• 서버에 영구 DB 없음: FastAPI 프로세스 메모리(dict)에만 상주",
    "• 5분 TTL: 60초 하트비트가 끊기면 방 목록에서 자동 제거",
    "• 행사 종료 시 완전 소멸: { rooms: 0, database: null, persisted: false }",
    "• '저장하지 않는 게 약속이 아니라 아키텍처 구조'",
    "• 참가자에게 계정이 없고, 주최자에게는 통계 숫자만 남김"
]
for i, l in enumerate(lines_db):
    p = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
    p.text = l
    p.font.size = Pt(12)
    p.font.color.rgb = TEXT_WHITE
    p.space_after = Pt(12)


# ==========================================
# SLIDE 7: 비즈니스 모델 & 고객 (Business Model)
# ==========================================
s7 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s7)
add_header(s7, "06. BUSINESS MODEL", "사용자는 무료 참가자, 돈은 주최자가 낸다", "주최자가 돈을 내는 이유는 참가자 만족도와 네트워킹 성과를 숫자로 보고해야 하기 때문입니다.")

add_card(s7, Inches(0.8), Inches(2.2), Inches(5.7), Inches(4.5), "유료 기능: 운영진 실시간 대시보드 & PDF 리포트", ACCENT_BLUE)
tb = s7.shapes.add_textbox(Inches(1.05), Inches(2.9), Inches(5.2), Inches(3.6))
tf = tb.text_frame
tf.word_wrap = True
lines_bm = [
    "• 실시간 참여율: 입장률(71%), 상태 작성률(91%), 접점 발견 건수",
    "• 대화 성사 지표: 첫마디 수락 건수(24건) 및 상보 교류율",
    "• 인기 요청 토픽 Top 4 분석 (배포·CI 9건, 기획 6건 등)",
    "• 행사 종료 즉시 '1장 PDF 네트워킹 성과 리포트' 자동 발급",
    "• 주최자의 다음 행사 스폰서 유치 및 상부 보고용 핵심 자료"
]
for i, l in enumerate(lines_bm):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.text = l
    p.font.size = Pt(12)
    p.font.color.rgb = TEXT_WHITE
    p.space_after = Pt(12)

add_card(s7, Inches(6.8), Inches(2.2), Inches(5.7), Inches(4.5), "수익 모델 및 시장 벤치마크", ACCENT_GREEN)
tb2 = s7.shapes.add_textbox(Inches(7.05), Inches(2.9), Inches(5.2), Inches(3.6))
tf2 = tb2.text_frame
tf2.word_wrap = True
lines_market = [
    "• 과금 모델: 행사 1회당 30~50만 원 (규모별 티어제 과금)",
    "• 참가자 리텐션이 아니라 '주최자 재도입률'이 핵심 지표",
    "• Mentimeter 모델: 참가자 리텐션 없이도 주최자 과금으로 흑자 달성",
    "• 글로벌 경쟁사(Swapcard, Brella)는 주최자에게 $1,000~$18,000 과금",
    "• 국내 시장(이벤터스, 온오프믹스, 페스타) 중 현장 AI 매칭 솔루션 부재"
]
for i, l in enumerate(lines_market):
    p = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
    p.text = l
    p.font.size = Pt(12)
    p.font.color.rgb = TEXT_WHITE
    p.space_after = Pt(12)


# ==========================================
# SLIDE 8: 시장 확장성 (Market Expansion)
# ==========================================
s8 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s8)
add_header(s8, "07. EXPANSION", "밀도가 있는 공간이라면 어디든 확장됩니다", "길거리나 카페처럼 밀도가 없는 곳은 배제하고, 목적이 뚜렷한 집합 공간에 집중합니다.")

domains = [
    ("IT 컨퍼런스 & 밋업", "FEConf, 우아콘, AWS 서밋 등", "연차/관심사 기반 상보 매칭\n(시니어 ↔ 주니어 이직·기술 질문)"),
    ("해커톤 & 캡스톤 디자인", "코쓱톤, SW중심대학 해커톤", "팀 빌딩 결핍 매칭\n(기획자 ↔ 디자이너 ↔ 개발자)"),
    ("기업 신입사원 온보딩", "대기업/스타트업 신규 입사자", "조직 적응 실패 퇴사율 49.1% 해소\n(타 부서 동기 간 아이스브레이킹)"),
    ("대학 캠퍼스 & 열람실", "시험기간 도서관, 미래관 라운지", "상시 학습 교류\n(자료구조 질문 ↔ 같이 야식 먹을 사람)")
]

for idx, (dtitle, dsub, dbody) in enumerate(domains):
    col = idx % 2
    row = idx // 2
    left = Inches(0.8 + col * 6.0)
    top = Inches(2.2 + row * 2.4)
    add_card(s8, left, top, Inches(5.7), Inches(2.1), dtitle, ACCENT_BLUE)
    tb = s8.shapes.add_textbox(left + Inches(0.25), top + Inches(0.7), Inches(5.2), Inches(1.2))
    tf = tb.text_frame
    p1 = tf.paragraphs[0]
    p1.text = dsub
    p1.font.size = Pt(11)
    p1.font.bold = True
    p1.font.color.rgb = ACCENT_GREEN
    p2 = tf.add_paragraph()
    p2.text = dbody
    p2.font.size = Pt(11)
    p2.font.color.rgb = TEXT_WHITE
    p2.space_before = Pt(4)


# ==========================================
# SLIDE 9: 개발 로드맵 (Roadmap)
# ==========================================
s9 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s9)
add_header(s9, "08. ROADMAP", "점진적 진화: 웹 PWA에서 BLE 네이티브까지", "기존 웹 기능을 결코 깨뜨리지 않고 네이티브 전파 레이어를 얹는 구조적 설계")

phases = [
    ("v0.1 해커톤 제출본 (현재 완료)", "• 웹 PWA + QR 방 입장 (3초 입장)\n• 상태 4종 + 46명 시간순 방 목록\n• Kookmin LLM 상보성 매칭 + 추천 첫마디\n• 모바일 운영진 실시간 대시보드\n• 모의 BLE 직접 채팅"),
    ("v0.2 첫 유료 판매본 (+1~2주)", "• 현장 구역 선택 (음료대, 창가, 무대 앞)\n• 행사 유형별 상태 세트 커스텀\n• 연사/스태프/스폰서 식별 배지 부여\n• 행사 종료 1장 PDF 성과 리포트 자동 발급\n• 행사당 30~50만 원 유료 도입 추진"),
    ("v0.3 Capacitor BLE 래핑 (+2~4주)", "• 웹 코드 재사용률 100% 안드로이드 래핑\n• @capgo BLE Peripheral 광고/스캔 탑재\n• 좌표 없는 물리적 닿는 거리 정밀 판정\n• BLE 단절 시 QR/웹 자동 폴백(Graceful Degradation)\n• 대형 컨퍼런스 네트워킹 정식 솔루션화")
]

for idx, (p_title, p_body) in enumerate(phases):
    left = Inches(0.8 + idx * 3.95)
    add_card(s9, left, Inches(2.2), Inches(3.8), Inches(4.5), p_title, ACCENT_GREEN if idx == 0 else ACCENT_BLUE)
    tb = s9.shapes.add_textbox(left + Inches(0.2), Inches(3.0), Inches(3.4), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = p_body
    p.font.size = Pt(12)
    p.font.color.rgb = TEXT_WHITE


# ==========================================
# SLIDE 10: 비전 & 마무리 (Vision)
# ==========================================
s10 = prs.slides.add_slide(blank_slide_layout)
set_slide_background(s10)

box_end = s10.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(11.3), Inches(3.8))
tf_e = box_end.text_frame
tf_e.word_wrap = True

p = tf_e.paragraphs[0]
p.text = "교류의 시작은, 말을 걸 이유를 아는 것입니다."
p.font.size = Pt(36)
p.font.bold = True
p.font.color.rgb = ACCENT_GREEN

p2 = tf_e.add_paragraph()
p2.text = "\"온라인에는 상태 메시지가 있는데, 현실에는 없었습니다.\nBside는 닿을 수 있는 거리에 있는 두 사람의 결핍과 경험을 이어냅니다.\n\n채팅은 만나기 위한 도구일 뿐이며, 우리의 최종 결과물은 현실에서의 만남입니다.\""
p2.font.size = Pt(18)
p2.font.color.rgb = TEXT_WHITE
p2.space_before = Pt(20)

p3 = tf_e.add_paragraph()
p3.text = "Connect with who's beside you — Bside\n경청해 주셔서 감사합니다."
p3.font.size = Pt(16)
p3.font.color.rgb = ACCENT_BLUE
p3.space_before = Pt(30)

output_path = "presentation/Bside_Presentation.pptx"
prs.save(output_path)
print(f"Presentation saved successfully to {output_path}")
