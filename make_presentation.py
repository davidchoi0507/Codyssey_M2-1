import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def create_balmaero_presentation():
    prs = Presentation()
    
    # 16:9 와이드스크린 설정 (13.333 x 7.5 inches)
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    # 빈 슬라이드 레이아웃
    blank_layout = prs.slide_layouts[6]
    
    # 디자인 컬러 팔레트 정의
    COLOR_PRIMARY = RGBColor(30, 27, 75)       # Deep Indigo (#1E1B4B)
    COLOR_SECONDARY = RGBColor(79, 70, 229)    # Bright Indigo (#4F46E5)
    COLOR_ACCENT = RGBColor(99, 102, 241)      # Soft Indigo (#6366F1)
    COLOR_SUCCESS = RGBColor(16, 185, 129)     # Emerald Green (#10B981)
    COLOR_AMBER = RGBColor(245, 158, 11)       # Amber (#F59E0B)
    COLOR_TEXT_DARK = RGBColor(15, 23, 42)     # Slate 900 (#0F172A)
    COLOR_TEXT_MUTED = RGBColor(100, 116, 139) # Slate 500 (#64748B)
    COLOR_BG_CARD = RGBColor(248, 250, 252)    # Slate 50 (#F8FAFC)
    COLOR_BG_LIGHT = RGBColor(238, 242, 255)   # Indigo 50 (#EEF2FF)
    COLOR_BORDER = RGBColor(226, 232, 240)     # Slate 200 (#E2E8F0)
    COLOR_WHITE = RGBColor(255, 255, 255)

    def add_header(slide, slide_num, category, title, time_guide):
        # 상단 카테고리 & 시간 가이드 배지
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(8.0), Inches(0.4))
        tf_cat = cat_box.text_frame
        tf_cat.word_wrap = True
        tf_cat.margin_left = tf_cat.margin_right = tf_cat.margin_top = tf_cat.margin_bottom = 0
        p_cat = tf_cat.paragraphs[0]
        p_cat.text = f"{slide_num}  |  {category}"
        p_cat.font.name = "Pretendard"
        p_cat.font.size = Pt(11)
        p_cat.font.bold = True
        p_cat.font.color.rgb = COLOR_SECONDARY
        
        # 시간 배지 (우측)
        time_box = slide.shapes.add_textbox(Inches(9.5), Inches(0.4), Inches(3.0), Inches(0.4))
        tf_time = time_box.text_frame
        tf_time.word_wrap = True
        tf_time.margin_left = tf_time.margin_right = tf_time.margin_top = tf_time.margin_bottom = 0
        p_time = tf_time.paragraphs[0]
        p_time.text = f"⏱ {time_guide}"
        p_time.alignment = PP_ALIGN.RIGHT
        p_time.font.name = "Pretendard"
        p_time.font.size = Pt(11)
        p_time.font.bold = True
        p_time.font.color.rgb = COLOR_TEXT_MUTED

        # 메인 타이틀
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.75), Inches(11.733), Inches(0.7))
        tf_title = title_box.text_frame
        tf_title.word_wrap = True
        tf_title.margin_left = tf_title.margin_right = tf_title.margin_top = tf_title.margin_bottom = 0
        p_title = tf_title.paragraphs[0]
        p_title.text = title
        p_title.font.name = "Pretendard"
        p_title.font.size = Pt(22)
        p_title.font.bold = True
        p_title.font.color.rgb = COLOR_TEXT_DARK

    def add_card(slide, left, top, width, height, title, content_list, bg_color=COLOR_BG_CARD, border_color=COLOR_BORDER, title_color=COLOR_PRIMARY):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg_color
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1)
        
        tf = shape.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.2)
        tf.margin_right = Inches(0.2)
        tf.margin_top = Inches(0.18)
        tf.margin_bottom = Inches(0.15)
        
        # 카드 제목
        p0 = tf.paragraphs[0]
        p0.text = title
        p0.font.name = "Pretendard"
        p0.font.size = Pt(13.5)
        p0.font.bold = True
        p0.font.color.rgb = title_color
        p0.space_after = Pt(7)
        
        # 본문 리스트
        for item in content_list:
            p = tf.add_paragraph()
            p.text = item
            p.font.name = "Pretendard"
            p.font.size = Pt(11)
            p.font.color.rgb = COLOR_TEXT_DARK
            p.space_after = Pt(3.5)
        return shape

    # ==========================================
    # SLIDE 1: 표지 (Cover)
    # ==========================================
    s1 = prs.slides.add_slide(blank_layout)
    
    bg1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = COLOR_PRIMARY
    bg1.line.fill.background()
    
    badge_box = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.6), Inches(4.2), Inches(0.45))
    badge_box.fill.solid()
    badge_box.fill.fore_color.rgb = COLOR_SECONDARY
    badge_box.line.fill.background()
    badge_tf = badge_box.text_frame
    badge_p = badge_tf.paragraphs[0]
    badge_p.text = "AI NATIVE FINAL CAPSTONE PROJECT"
    badge_p.alignment = PP_ALIGN.CENTER
    badge_p.font.name = "Pretendard"
    badge_p.font.size = Pt(11)
    badge_p.font.bold = True
    badge_p.font.color.rgb = COLOR_WHITE
    
    title_box = s1.shapes.add_textbox(Inches(1.2), Inches(2.2), Inches(10.5), Inches(1.3))
    t_tf = title_box.text_frame
    t_p = t_tf.paragraphs[0]
    t_p.text = "발매로 (Balmaero)"
    t_p.font.name = "Pretendard"
    t_p.font.size = Pt(44)
    t_p.font.bold = True
    t_p.font.color.rgb = COLOR_WHITE
    
    desc_box = s1.shapes.add_textbox(Inches(1.2), Inches(3.6), Inches(10.5), Inches(1.2))
    d_tf = desc_box.text_frame
    d_tf.word_wrap = True
    d_p1 = d_tf.paragraphs[0]
    d_p1.text = "“음원 한 곡에서, 발매 가능한 릴리즈 팩까지.”"
    d_p1.font.name = "Pretendard"
    d_p1.font.size = Pt(22)
    d_p1.font.bold = True
    d_p1.font.color.rgb = RGBColor(165, 180, 252)
    d_p1.space_after = Pt(8)
    
    d_p2 = d_tf.add_paragraph()
    d_p2.text = "완성된 음원 한 곡을 분석해 발매에 필요한 기획·비주얼·메타데이터를 하나의 릴리즈 팩으로 만들어 주는 AI 발매 준비 플랫폼"
    d_p2.font.name = "Pretendard"
    d_p2.font.size = Pt(13)
    d_p2.font.color.rgb = RGBColor(226, 232, 240)
    
    meta_box = s1.shapes.add_textbox(Inches(1.2), Inches(5.6), Inches(10.5), Inches(1.0))
    m_tf = meta_box.text_frame
    m_p = m_tf.paragraphs[0]
    m_p.text = "발표: 발매로 개발팀  |  평가 일시: 2026. 10. 21 ~ 22  |  배포: Oracle Cloud VM & Vercel"
    m_p.font.name = "Pretendard"
    m_p.font.size = Pt(12)
    m_p.font.color.rgb = RGBColor(148, 163, 184)
    
    s1.notes_slide.notes_text_frame.text = (
        "[00:00 - 00:30] 표지 및 시작 인사\n"
        "“안녕하십니까, 인디 뮤지션을 위한 AI 발매 준비 플랫폼 '발매로'의 발표를 맡은 팀장입니다.\n"
        "저희 서비스의 핵심 슬로건은 '음원 한 곡에서, 발매 가능한 릴리즈 팩까지'입니다.\n"
        "오늘 발표를 통해 창작자가 음악을 완성한 뒤 마주하는 발매 준비의 병목을 AI로 어떻게 해결했는지 말씀드리겠습니다.”"
    )

    # ==========================================
    # SLIDE 2: 문제 정의 (Problem)
    # ==========================================
    s2 = prs.slides.add_slide(blank_layout)
    add_header(s2, "#02", "PROBLEM DEFINITION", "곡은 완성돼도 발매 준비는 끝나지 않습니다", "00:30 ~ 01:30 (1분)")
    
    add_card(s2, Inches(0.8), Inches(1.7), Inches(3.6), Inches(4.8),
             "1. 파편화된 발매 준비 과정",
             ["• 음원은 완성했지만 앨범 커버, 소개글, 비주얼 영상, 유통사 양식이 제각각 분산됨",
              "• 디자인 툴, 메타데이터 문서, 이메일 등 5개 이상의 창을 오가며 준비해야 하는 피로감",
              "• 1인 창작자가 오롯이 감당하기엔 너무 많은 행정적·시각적 허들"],
             title_color=COLOR_PRIMARY)
             
    add_card(s2, Inches(4.866), Inches(1.7), Inches(3.6), Inches(4.8),
             "2. 1차 가설과 인디밴드의 반응",
             ["• [초기 가설] 인디밴드는 앨범 커버와 홍보 에셋을 AI가 만들어주면 가장 만족할 것이다.",
              "• [실제 테스트 반응] 전문 인디밴드는 확고한 예술적 주관을 가지고 있어 AI 커버에 쉽게 만족하지 못함.",
              "• 프롬프트를 고도화했으나 '전문가 시장에서 AI 비주얼만으로는 승산이 없다'는 한계 직면"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SECONDARY, title_color=COLOR_SECONDARY)

    add_card(s2, Inches(8.933), Inches(1.7), Inches(3.6), Inches(4.8),
             "3. 진짜 막히는 지점의 발견",
             ["• 인디밴드와의 인터뷰 및 테스트를 통해 발견한 진짜 병목:",
              "• “디자인도 고민이지만, 유통사마다 다른 곡 메타데이터 규격과 심의 기준, 소개글 작성이 훨씬 막막하다.”",
              "• 외주 비용보다 '어떻게 발매 규격을 맞춰야 할지 모르는 막막함'이 핵심 문제"],
             title_color=COLOR_PRIMARY)

    s2.notes_slide.notes_text_frame.text = (
        "[00:30 - 01:30] 문제 정의 스크립트\n"
        "“곡을 만드는 것과 곡을 발매하는 것은 완전히 다른 영역이었습니다.\n"
        "저희는 처음에 '전문 인디밴드에게 앨범 커버를 만들어주면 좋아하겠지'라고 생각했습니다.\n"
        "하지만 실제로 만나본 인디밴드는 본인만의 예술적 감각이 뚜렷해 AI 비주얼에 만족하지 못했습니다.\n"
        "그 과정에서 발견한 진짜 문제는 디자인 그 자체가 아니라, 유통사별 규격에 맞춘 메타데이터, A&R 소개글, 복잡한 발매 준비 절차가 파편화되어 있다는 점이었습니다.”"
    )

    # ==========================================
    # SLIDE 3: 솔루션 및 피드백 기반 방향 전환 (Solution & Pivot)
    # ==========================================
    s3 = prs.slides.add_slide(blank_layout)
    add_header(s3, "#03", "SOLUTION & PIVOT", "사용자 인터뷰가 문제의 범위를 바꿨습니다", "01:30 ~ 02:30 (1분)")
    
    add_card(s3, Inches(0.8), Inches(1.7), Inches(5.6), Inches(4.8),
             "🔄 1차 기획 ➔ 2차 기획 방향 전환 (DECISIONS #30)",
             ["• [대상 전환] 전문 인디밴드 ➔ '처음 발매하는 누구나 (개인, 학생, 아마추어)'",
              "• [중심 이동] 비주얼 커버 중심 ➔ '발매 준비 · 홍보 · 커뮤니티 반응' 중심",
              "• [커버의 위상] 메인 제품에서 '발매 준비를 보조하는 기능'으로 재정의",
              "• [차별화 포인트] AI가 알아서 결정하는 것이 아닌, 'AI가 먼저 듣고 사람이 고치는' A&R 협업 구조 채택"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SECONDARY, title_color=COLOR_SECONDARY)

    add_card(s3, Inches(6.8), Inches(1.7), Inches(5.733), Inches(4.8),
             "✨ 발매로의 3대 핵심 해결책",
             ["① 안전하게 발매 준비하기",
              "   - 발매 정보 표기 검사 및 자동 교정, 권리 자가진단, 유통사별 판정",
              "   - 등록 마감일 자동 계산 및 제출 준비표(CSV) 일괄 생성",
              "② 최소한의 홍보 에셋 완성",
              "   - 채널별 맞춤 홍보 카피, ffmpeg 기반 숏폼(15초) & Spotify Canvas(8초) 영상",
              "③ 내 노래에 대한 반응 확인 ('들어봐')",
              "   - 발매 전 커뮤니티(별점·태그·한마디) 피드백 수집 및 창작자 간 소통 공간"],
             title_color=COLOR_PRIMARY)

    s3.notes_slide.notes_text_frame.text = (
        "[01:30 - 02:30] 솔루션 및 방향 전환 스크립트\n"
        "“저희는 팀 결정(DECISIONS #30)을 통해 과감하게 타겟과 제품 중심을 재정의했습니다.\n"
        "타겟을 전문 인디밴드에서 '처음 발매에 도전하는 학생, 개인 창작자'로 바꾸고,\n"
        "비주얼 제작 도구에서 '발매 준비 올인원 플랫폼'으로 제품의 범위를 확장했습니다.\n"
        "그 결과, 안전한 발매 준비 규격 검사부터 숏폼 홍보 영상, 그리고 동료 창작자들의 반응을 확인하는 '들어봐' 커뮤니티까지 한 번에 끝내는 발매로가 탄생했습니다.\n"
        "그럼 실제로 서비스가 어떻게 작동하는지 시연 화면을 보여드리겠습니다.”"
    )

    # ==========================================
    # SLIDE 4: 핵심 서비스 시연 (Demo) ★ '들어봐' 반응 추가!
    # ==========================================
    s4 = prs.slides.add_slide(blank_layout)
    add_header(s4, "#04", "SERVICE DEMO", "발매로의 전체 흐름을 직접 보여드리겠습니다", "02:30 ~ 05:00 (2.5분) ★ 핵심")
    
    step_w = Inches(2.75)
    gap = Inches(0.24)
    start_x = Inches(0.8)
    
    steps_data = [
        ("Step 1. 음원 업로드 & 파싱",
         ["• 오디오 파일 업로드",
          "• librosa 기반 물리량 파싱 (BPM, 스펙트럼 에너지)",
          "• 실시간 분석 진행률 UI",
          "• [체험 모드] 예시곡 즉시 지원"],
         COLOR_BG_CARD, COLOR_PRIMARY),
        ("Step 2. A&R 기획 & 수정",
         ["• Gemini 오디오 감성 분석",
          "• A&R 콘셉트 리포트 자동 생성",
          "• [협업 설계] 연필 아이콘 인라인 수정기 제공",
          "• 30초 내 초안 완성"],
         COLOR_BG_LIGHT, COLOR_SECONDARY),
        ("Step 3. 비주얼 에셋 선택",
         ["• gpt-image-2 앨범 커버 3종",
          "• 3000px 초고화질 업스케일",
          "• ffmpeg 숏폼(15초) 영상",
          "• Spotify Canvas(8초) 생성"],
         COLOR_BG_CARD, COLOR_PRIMARY),
        ("Step 4. 릴리즈 팩 & '들어봐'",
         ["• 발매 규격 검사 & 마감일 계산",
          "• 채널별 홍보 글 & 피칭 메일",
          "• 제출 준비표(CSV) + ZIP 팩",
          "• 🎧 '들어봐' 피드 공개 (10초 시연)"],
         COLOR_BG_LIGHT, COLOR_SUCCESS)
    ]
    
    for i, (stitle, scontent, sbg, stcol) in enumerate(steps_data):
        x = start_x + (step_w + gap) * i
        add_card(s4, x, Inches(1.7), step_w, Inches(4.3), stitle, scontent, bg_color=sbg, title_color=stcol)
        
    demo_callout = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.15), Inches(11.733), Inches(0.65))
    demo_callout.fill.solid()
    demo_callout.fill.fore_color.rgb = COLOR_BG_LIGHT
    demo_callout.line.color.rgb = COLOR_SECONDARY
    d_tf = demo_callout.text_frame
    d_p = d_tf.paragraphs[0]
    d_p.text = "💡 데모 운영 안정성 확보: 네트워크 및 외부 API 한도 리스크에 대비하여 [60초 백업 시연 영상]과 [원클릭 예시곡 체험 모드]를 상시 대기 중입니다."
    d_p.font.name = "Pretendard"
    d_p.font.size = Pt(11)
    d_p.font.bold = True
    d_p.font.color.rgb = COLOR_SECONDARY

    s4.notes_slide.notes_text_frame.text = (
        "[02:30 - 05:00] 데모 시연 스크립트\n"
        "“실제 서비스 시연 화면입니다. 발매로는 4단계 흐름으로 진행됩니다.\n"
        "Step 1: 음원을 올리면 librosa가 BPM과 오디오 특성을 3초 만에 추출합니다.\n"
        "Step 2: Gemini가 곡을 듣고 A&R 기획 초안을 제시합니다. 중요한 건 창작자가 연필 아이콘을 눌러 직접 수정할 수 있다는 점입니다.\n"
        "Step 3: 승인된 콘셉트를 바탕으로 커버 아트워크와 숏폼·Canvas 비디오가 생성됩니다.\n"
        "Step 4: 마지막으로 유통사 제출 규격 검사를 거쳐 마감일 계산표와 ZIP 릴리즈 팩이 완성됩니다.\n"
        "그리고 피봇의 세 번째 축인 '들어봐' 커뮤니티로 넘어가 내 노래를 공개하고 동료 창작자들의 별점과 태그 반응을 확인하는 과정까지 10초 만에 완결됩니다.”"
    )

    # ==========================================
    # SLIDE 5: 시스템 아키텍처 (System Architecture)
    # ==========================================
    s5 = prs.slides.add_slide(blank_layout)
    add_header(s5, "#05", "SYSTEM ARCHITECTURE", "한 번의 업로드가 릴리즈 팩이 되기까지", "05:00 ~ 05:45 (45초)")
    
    add_card(s5, Inches(0.8), Inches(1.7), Inches(3.6), Inches(4.8),
             "1. Frontend (Client Layer)",
             ["• 플랫폼: React, Vite, Tailwind CSS",
              "• 배포 환경: Vercel CDN 글로벌 배포",
              "• 핵심 인터랙션:",
              "  - 오디오 파형 반응형 재생 및 시각화",
              "  - A&R 리포트 인라인 실시간 편집기",
              "  - '들어봐' 커뮤니티 피드 & 비동기 작업 폴링",
              "  - 모바일 반응형 최적화"],
             title_color=COLOR_PRIMARY)

    add_card(s5, Inches(4.866), Inches(1.7), Inches(3.6), Inches(4.8),
             "2. Backend & Engine (API Layer)",
             ["• 프레임워크: FastAPI (Python 3.12 비동기)",
              "• 호스팅: Oracle Cloud VM (api.201.n-e.kr)",
              "• 코어 파이프라인:",
              "  - librosa DSP 물리량 추출 엔진",
              "  - ffmpeg 영상 렌더링 파이프라인 (숏폼/Canvas)",
              "  - 발매 규격 검사기 및 ZIP 번들러",
              "  - SQLite / 세션 관리 및 작업 캐싱"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SECONDARY, title_color=COLOR_SECONDARY)

    add_card(s5, Inches(8.933), Inches(1.7), Inches(3.6), Inches(4.8),
             "3. AI & Model Layer (Inference)",
             ["• 오디오 멀티모달: Google Gemini 3.8 Flash (Fallback 체인: 3.7 ➔ 3.6 ➔ 3.5)",
              "• 에이전트 프레임워크: LangChain",
              "• 이미지 생성: gpt-image-2 (코디세이 API) + 3000px 초고화질 업스케일러",
              "• 구조적 파싱: Pydantic & JSON 스키마"],
             title_color=COLOR_PRIMARY)

    s5.notes_slide.notes_text_frame.text = (
        "[05:00 - 05:45] 시스템 아키텍처 스크립트\n"
        "“이 모든 과정을 가능하게 하는 발매로의 시스템 구조입니다.\n"
        "Vercel에 배포된 반응형 React 프론트엔드가 Oracle Cloud VM의 FastAPI 백엔드와 비동기로 통신합니다.\n"
        "백엔드는 사운드 처리 엔진과 비디오 생성기를 자체 구동하며,\n"
        "Gemini 3.8 Flash 오디오 모델과 코디세이 이미지 API를 LangChain 오케스트레이터로 연결해 안정적으로 결과를 도출합니다.”"
    )

    # ==========================================
    # SLIDE 6: 핵심 기술 요소 ① 하이브리드 오디오 엔진
    # ==========================================
    s6 = prs.slides.add_slide(blank_layout)
    add_header(s6, "#06", "CORE TECH 1", "숫자로 분석하고, 콘셉트로 해석합니다", "05:45 ~ 06:30 (45초)")
    
    add_card(s6, Inches(0.8), Inches(1.7), Inches(5.6), Inches(4.3),
             "📊 Track A. librosa DSP 엔진 (정량적 물리량)",
             ["• 음원의 물리적 사운드 데이터를 수학적으로 분석",
              "• 주요 추출 지표:",
              "  - BPM (템포) 및 비트 그리드 정밀 측정",
              "  - Spectral Centroid (음색의 밝기/무게감)",
              "  - RMS Energy (곡의 에너지 및 다이내믹 레인지)",
              "• 역할: 객관적인 음원 스펙을 제공하여 유통사 메타데이터 규격 작성의 신뢰도 확보"],
             title_color=COLOR_PRIMARY)

    add_card(s6, Inches(6.8), Inches(1.7), Inches(5.733), Inches(4.3),
             "🎧 Track B. Gemini 3.8 Flash (청각 감성 해석)",
             ["• 오디오 파일을 직접 듣고 멀티모달로 이해하는 AI",
              "• 주요 해석 내용:",
              "  - 보컬 특성 (남성/여성, 음색, 딜리버리 스타일)",
              "  - 주요 사용 악기 및 편곡 분위기 파악",
              "  - 곡이 전달하는 감정선(Melancholic, Energetic 등)",
              "• 역할: 물리량이 포착하지 못하는 곡의 무드와 예술적 콘셉트 해석"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SECONDARY, title_color=COLOR_SECONDARY)

    c6 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.15), Inches(11.733), Inches(0.65))
    c6.fill.solid()
    c6.fill.fore_color.rgb = COLOR_BG_CARD
    c6.line.color.rgb = COLOR_BORDER
    c6_tf = c6.text_frame
    c6_p = c6_tf.paragraphs[0]
    c6_p.text = "🔑 핵심 설계 원칙: AI의 분석 결과는 '확정'이 아닌 사용자가 언제든 수정할 수 있는 '정교한 초안(Draft)'으로 작동합니다."
    c6_p.font.name = "Pretendard"
    c6_p.font.size = Pt(11)
    c6_p.font.bold = True
    c6_p.font.color.rgb = COLOR_TEXT_DARK

    s6.notes_slide.notes_text_frame.text = (
        "[05:45 - 06:30] 핵심 기술 1 스크립트\n"
        "“첫 번째 핵심 기술은 2-Track 하이브리드 오디오 엔진입니다.\n"
        "음악을 분석할 때 숫자로만 보면 감성이 빠지고, LLM으로만 보면 정확한 BPM 같은 물리량을 놓칩니다.\n"
        "따라서 저희는 librosa DSP로 BPM과 사운드 에너지를 정량 추출하고,\n"
        "동시에 Gemini 3.8 Flash에 오디오를 직접 들려주어 보컬과 무드를 감성적으로 해석했습니다.\n"
        "이 분석 결과는 사용자가 검토하고 직접 수정할 수 있는 최적의 초안으로 제공됩니다.”"
    )

    # ==========================================
    # SLIDE 7: 핵심 기술 요소 ② Multi-Agent 협업
    # ==========================================
    s7 = prs.slides.add_slide(blank_layout)
    add_header(s7, "#07", "CORE TECH 2", "전문 역할이 하나의 콘셉트를 공유합니다", "06:30 ~ 07:15 (45초)")
    
    add_card(s7, Inches(0.8), Inches(1.7), Inches(3.6), Inches(4.3),
             "1. A&R 기획 에이전트",
             ["• 입력: DSP 물리량 + Gemini 청각 분석",
              "• 산출물: 곡명 제안, 장르 정의, 앨범 콘셉트, 타겟 리스너 프로파일",
              "• [중요 분기점]: 사람이 직접 확인하고 수정·승인한 뒤 다음 에이전트로 전달"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SECONDARY, title_color=COLOR_SECONDARY)

    add_card(s7, Inches(4.866), Inches(1.7), Inches(3.6), Inches(4.3),
             "2. 비주얼 디렉터 에이전트",
             ["• 승인된 A&R 콘셉트를 시각 프롬프트로 변환",
              "• gpt-image-2를 통해 앨범 커버 3종 생성 및 3000px 업스케일링",
              "• ffmpeg 파이프라인과 연동하여 숏폼/Canvas 영상 프레임 구성"],
             title_color=COLOR_PRIMARY)

    add_card(s7, Inches(8.933), Inches(1.7), Inches(3.6), Inches(4.3),
             "3. 카피 · 피칭 · 에디토리얼 (총 5종)",
             ["• 승인된 콘셉트와 곡 소개를 바탕으로 텍스트 자동화",
              "• [카피라이터] 인스타·틱톡·스레드·X 맞춤 홍보 카피",
              "• [피칭 & 에디토리얼] 영/한 피칭 메일 및 Spotify 피칭 문구",
              "• 5종 에이전트가 단일 A&R 콘셉트를 공유하여 일관성 유지"],
             title_color=COLOR_PRIMARY)

    c7 = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.15), Inches(11.733), Inches(0.65))
    c7.fill.solid()
    c7.fill.fore_color.rgb = COLOR_BG_LIGHT
    c7.line.color.rgb = COLOR_SECONDARY
    c7_tf = c7.text_frame
    c7_p = c7_tf.paragraphs[0]
    c7_p.text = "⚡ LangChain 오케스트레이션 이점: 단일 프롬프트 대비 프롬프트 오염을 방지하고, 에이전트 간 일관된 콘셉트를 JSON 파서로 완벽히 공유합니다."
    c7_p.font.name = "Pretendard"
    c7_p.font.size = Pt(11)
    c7_p.font.bold = True
    c7_p.font.color.rgb = COLOR_SECONDARY

    s7.notes_slide.notes_text_frame.text = (
        "[06:30 - 07:15] 핵심 기술 2 스크립트\n"
        "“두 번째 핵심 기술은 LangChain 기반의 멀티에이전트 협업 구조입니다.\n"
        "단일 프롬프트에 모든 요청을 몰아넣으면 환각이 생기고 품질이 급격히 떨어집니다.\n"
        "발매로는 A&R 에이전트가 중심 콘셉트를 잡고, 창작자가 이를 수락하면,\n"
        "비주얼 디렉터, 카피라이터, 피칭, 에디토리얼 등 총 5종의 전문 에이전트가 병렬로 작동하여 커버 아트, 숏폼 영상, 채널별 홍보문과 피칭 텍스트를 완성합니다.\n"
        "도구 호출을 지원하지 않는 환경에서도 JSON 스키마 파서를 통해 견고하게 데이터를 전달하도록 구현했습니다.”"
    )

    # ==========================================
    # SLIDE 8: 실사용자 검증 및 피드백 반영 (원일 님 피드백 반영!)
    # ==========================================
    s8 = prs.slides.add_slide(blank_layout)
    add_header(s8, "#08", "TESTING & FEEDBACK", "다섯 명의 테스트가 세 가지 변화를 만들었습니다", "07:15 ~ 08:00 (45초) ★ 필수요건")
    
    # 좌측: 정량 실측 수치 카드 (원일 님 수치 100% 반영)
    add_card(s8, Inches(0.8), Inches(1.7), Inches(5.6), Inches(4.8),
             "📊 실사용 테스트 실측 지표 (10/16~19)",
             ["• [전체 모수] 서버 기록 기준 35명 사용 · 설문 10건",
              "   (구분: 발매 준비 19명, '들어봐' 반응 참여 16명 / 팀원 포함)",
              "",
              "• [핵심 1] 업로드 ➔ A&R 노트 완성: 중앙값 30초 (0.5분, 실패 0건)",
              "• [핵심 2] 노트를 직접 수정한 작업: 71% (5/7건)",
              "   👉 'AI가 먼저 듣고 사람이 고친다'는 협업 설계가 유효함을 증명!",
              "",
              "• [만족도] 전반 만족도 & 재사용 의향 & AI해석 정확도: 모두 4.67 / 5.0",
              "• [홍보글 평가] 응답자 3명 전원 '그대로 쓸 수 있다' 답변",
              "   (모수: 10/18 3차 실사용자 설문 3명 정밀 실측)"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SUCCESS, title_color=COLOR_SUCCESS)

    # 우측: 피드백 반영 Before / After (조건 명시)
    add_card(s8, Inches(6.8), Inches(1.7), Inches(5.733), Inches(4.8),
             "🛠 피드백 기반 핵심 개선 사례 (Before ➔ After)",
             ["① 커버 아트 생성 시간 대폭 단축",
              "   - Before: 생성 대기 시간 5분 초과로 인한 사용자 이탈",
              "   - After: 후보 6장 ➔ 3장, 키 2개 교대로 [체험 작업 실측 81초] 단축!",
              "",
              "② '노트를 받고 뭘 해야 할지 모름' 이탈 방지",
              "   - Before: 텍스트가 멈춘 듯 보여 혼란 발생 (가장 많이 멈춘 구간)",
              "   - After: 직관적인 연필 아이콘, 수정 안내 가이드, 버전 히스토리 추가",
              "",
              "③ 곡이 없는 사용자 배려",
              "   - After: 파일 없이도 즉시 체험 가능한 [체험 모드(예시 곡)] 신설"],
             title_color=COLOR_PRIMARY)

    s8.notes_slide.notes_text_frame.text = (
        "[07:15 - 08:00] 피드백 및 테스트 스크립트\n"
        "“실제 사용자 테스트 결과와 개선 내역입니다.\n"
        "10월 16일부터 19일까지 서버 기록 기준 총 35명이 서비스를 사용했습니다.\n"
        "19명이 발매 준비를, 16명이 들어봐 반응에 참여했습니다.\n"
        "특히 노트를 직접 수정한 작업 비율이 71%에 달했고, 홍보 글은 설문 참여자 3명 전원이 '그대로 쓸 수 있다'고 답했습니다.\n"
        "또한 초기 피드백에서 커버 생성에 5분 이상 걸리던 문제를 키 로테이션과 후보 최적화로 체험 작업 실측 81초까지 단축시켰고,\n"
        "노트 수정 안내와 예시곡 체험 모드를 추가하여 사용성을 대폭 끌어올렸습니다.”"
    )

    # ==========================================
    # SLIDE 9: 팀 협업 및 역할 분담 (Team & Engineering)
    # ==========================================
    s9 = prs.slides.add_slide(blank_layout)
    add_header(s9, "#09", "TEAM & COLLABORATION", "역할은 나누고, 하나의 제품으로 연결했습니다", "08:00 ~ 08:45 (45초)")
    
    rows = 6
    cols = 4
    left = Inches(0.8)
    top = Inches(1.7)
    width = Inches(11.733)
    height = Inches(3.2)
    
    table_shape = s9.shapes.add_table(rows, cols, left, top, width, height)
    table = table_shape.table
    table.columns[0].width = Inches(1.5)
    table.columns[1].width = Inches(2.4)
    table.columns[2].width = Inches(5.1)
    table.columns[3].width = Inches(2.733)
    
    headers = ["구분", "담당자 / 포지션", "세부 담당 업무 및 실기여", "주요 산출물"]
    for j, h in enumerate(headers):
        cell = table.cell(0, j)
        cell.text = h
        cell.fill.solid()
        cell.fill.fore_color.rgb = COLOR_PRIMARY
        p = cell.text_frame.paragraphs[0]
        p.font.name = "Pretendard"
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = COLOR_WHITE
        
    team_data = [
        ("팀장 (David)", "Product Lead & Frontend", "발매로 기획 총괄, 4단계 UX 설계, React 프론트엔드 UI 구현 및 최적화", "React UI 코드, 발표 자료"),
        ("원일", "Tech Lead & AI / Backend", "FastAPI 서버 전체, librosa+Gemini 오디오 엔진, LangChain 5종, 유통사 검사", "백엔드 API, AI 파이프라인, 제출문서 5종"),
        ("이은희", "Service Policy & UX Research", "서비스 이용약관 및 개인정보 동의서(v1.2~1.6) 기획, 데이터 파기 규정 수립, 10/16 피드백", "개인정보 동의서(v1.6), 개선안 리포트"),
        ("신미영", "Industry Research & QA", "유통사(DistroKid/뮤즈플랫폼) 규격 조사, 실음원 테스트 진행 및 개선안 리포트(10/16 10건 + 개선안 8건)", "유통사 조사서, 실음원 테스트 리포트"),
        ("김지은", "Audio Dataset & Usability", "장르별 테스트용 음원 데이터 수집·정비, 실사용자 테스트 진행 지원 및 만족도 설문 집계", "테스트 음원셋, 설문 집계 데이터")
    ]
    
    for i, row in enumerate(team_data):
        for j, val in enumerate(row):
            cell = table.cell(i+1, j)
            cell.text = val
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_WHITE if i % 2 == 0 else COLOR_BG_CARD
            p = cell.text_frame.paragraphs[0]
            p.font.name = "Pretendard"
            p.font.size = Pt(10.5)
            p.font.color.rgb = COLOR_TEXT_DARK
            
    c9 = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(5.2), Inches(11.733), Inches(1.6))
    c9.fill.solid()
    c9.fill.fore_color.rgb = COLOR_BG_LIGHT
    c9.line.color.rgb = COLOR_SECONDARY
    c9_tf = c9.text_frame
    c9_tf.margin_left = Inches(0.2)
    c9_tf.margin_top = Inches(0.15)
    
    p_git1 = c9_tf.paragraphs[0]
    p_git1.text = "🌿 GitHub 형상 관리 및 팀 협업 프로세스"
    p_git1.font.name = "Pretendard"
    p_git1.font.size = Pt(12)
    p_git1.font.bold = True
    p_git1.font.color.rgb = COLOR_PRIMARY
    p_git1.space_after = Pt(4)
    
    p_git2 = c9_tf.add_paragraph()
    p_git2.text = "• 브랜치 전략: 기능별 feature 브랜치 분리 ➔ Pull Request(PR) 기반 상호 코드 리뷰 후 main 머지"
    p_git2.font.name = "Pretendard"
    p_git2.font.size = Pt(10.5)
    p_git2.font.color.rgb = COLOR_TEXT_DARK
    
    p_git3 = c9_tf.add_paragraph()
    p_git3.text = "• 피드백 반영: 실사용자 테스트에서 수렴된 개선 의견을 화면/백엔드 태그로 분담하여 신속하게 처리"
    p_git3.font.name = "Pretendard"
    p_git3.font.size = Pt(10.5)
    p_git3.font.color.rgb = COLOR_TEXT_DARK

    s9.notes_slide.notes_text_frame.text = (
        "[08:00 - 08:45] 팀 협업 스크립트\n"
        "“팀 협업 및 형상 관리 내역입니다.\n"
        "저희 5명은 기획/프론트엔드, AI/백엔드 코어 개발과 함께 서비스 정책·동의서 설계, 유통사 실무 규격 조사, 테스트 음원 수집 및 사용성 검증으로 역할을 전문적으로 분담했습니다.\n"
        "GitHub PR을 통해 상호 코드 리뷰를 거쳐 안전하게 머지했으며,\n"
        "테스트 과정에서 수렴된 피드백을 신속하게 조율하며 완성도 높은 제품으로 완성했습니다.”"
    )

    # ==========================================
    # SLIDE 10: 배포 현황 및 AI 윤리 (Deployment & AI Ethics)
    # ==========================================
    s10 = prs.slides.add_slide(blank_layout)
    add_header(s10, "#10", "DEPLOYMENT & ETHICS", "직접 사용할 수 있는 서비스로 배포했습니다", "08:45 ~ 09:15 (30초) ★ 필수요건")
    
    add_card(s10, Inches(0.8), Inches(1.7), Inches(5.6), Inches(4.8),
             "🌐 외부 접근 가능한 실배포 환경",
             ["• [프론트엔드 URL] https://codyssey-m2-1.vercel.app",
              "• [백엔드 API URL] Oracle Cloud VM (api.201.n-e.kr)",
              "• 상시 가동 상태로 외부 누구나 즉시 접근 가능",
              "",
              "• [지원 환경 및 최적화]",
              "  - 데스크톱 Chrome/Edge/Safari 완벽 대응",
              "  - 모바일 웹 뷰 가독성 및 터치 인터랙션 최적화",
              "  - 예시곡 체험 모드로 파일이 없는 사용자도 즉시 시연 가능"],
             title_color=COLOR_PRIMARY)

    add_card(s10, Inches(6.8), Inches(1.7), Inches(5.733), Inches(4.8),
             "⚖️ 철저한 AI 윤리 및 저작권 준수",
             ["① AI 생성물 투명성 명시",
              "   - ZIP 릴리즈 팩과 결과물에 사용 AI 모델 표기, 커뮤니티 곡 AI 활용 여부 표시",
              "   - 음원 등록 시 'AI 활용 여부' 표시 선택권 제공",
              "",
              "② 저작권 보호 및 무단 도용 방지",
              "   - 오디오 핑거프린트(소리 지문)를 통한 타인 곡 도용 및 중복 업로드 차단",
              "",
              "③ 개인정보 보호 및 데이터 파기",
              "   - 서비스 이용 동의서 v1.6 적용",
              "   - 테스트 종료 후 [10월 31일 테스트 음원 및 유저 데이터 일괄 파기] 명시"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SECONDARY, title_color=COLOR_SECONDARY)

    s10.notes_slide.notes_text_frame.text = (
        "[08:45 - 09:15] 배포 및 윤리 스크립트\n"
        "“발매로는 현재 Vercel과 Oracle Cloud VM을 통해 외부에서 실제 접속 가능한 형태로 배포되어 있습니다.\n"
        "또한 AI 네이티브 프로젝트로서 AI 윤리를 철저히 준수했습니다.\n"
        "AI 생성물 표기는 물론, 타인의 음원을 도용하지 못하도록 소리 지문 기술을 적용했으며,\n"
        "이용 동의서에 따라 10월 31일 모든 테스트 데이터를 일괄 파기하도록 설계했습니다.”"
    )

    # ==========================================
    # SLIDE 11: 향후 로드맵 (Roadmap)
    # ==========================================
    s11 = prs.slides.add_slide(blank_layout)
    add_header(s11, "#11", "ROADMAP", "릴리즈 팩 생성에서 실제 발매 연결까지", "09:15 ~ 09:45 (30초)")
    
    add_card(s11, Inches(0.8), Inches(1.7), Inches(3.6), Inches(4.8),
             "Phase 1. 현재 완성 단계",
             ["• [발매 준비물 패키징 완성]",
              "• 사운드 물리량 + 감성 분석",
              "• A&R 리포트 & 초안 편집기",
              "• 앨범 커버 3종 & 숏폼/Canvas 영상",
              "• 유통사 규격 검사표 & ZIP 팩",
              "• 10/18 실사용자 검증 완료"],
             bg_color=COLOR_BG_LIGHT, border_color=COLOR_SUCCESS, title_color=COLOR_SUCCESS)

    add_card(s11, Inches(4.866), Inches(1.7), Inches(3.6), Inches(4.8),
             "Phase 2. 다음 고도화 단계",
             ["• [검수 및 커스텀 고도화]",
              "• 심의 가사 금칙어 자동 필터링",
              "• 앨범 커버 텍스트 인포그래픽 합성기",
              "• 멀티 트랙(EP/정규 앨범) 지원",
              "• 유통사별 최신 규격 DB 자동 동기화"],
             title_color=COLOR_PRIMARY)

    add_card(s11, Inches(8.933), Inches(1.7), Inches(3.6), Inches(4.8),
             "Phase 3. 장기 비전",
             ["• [유통 파트너 직접 연동]",
              "• 국내 주요 인디 음원 유통사 제휴",
              "• 유통사 직접 전송 파이프라인 연계",
              "• 글로벌 발매(스포티파이, 애플뮤직) 메타데이터 국제 표준 지원"],
             title_color=COLOR_PRIMARY)

    s11.notes_slide.notes_text_frame.text = (
        "[09:15 - 09:45] 로드맵 스크립트\n"
        "“향후 발전 로드맵입니다.\n"
        "현재 발매로는 발매에 필요한 모든 자료를 완벽한 릴리즈 팩으로 묶어주는 1단계를 달성했습니다.\n"
        "다음 단계에서는 심의 가사 검수와 다중 트랙 EP 지원을 강화하고,\n"
        "장기적으로는 유통사들과의 파트너십을 통해 발매로에서 클릭 한 번으로 유통 심사까지 직결되는 유통 제휴 생태계를 만들어갈 것입니다.”"
    )

    # ==========================================
    # SLIDE 12: 엔딩 및 질의응답 (Ending & Q&A)
    # ==========================================
    s12 = prs.slides.add_slide(blank_layout)
    
    bg12 = s12.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg12.fill.solid()
    bg12.fill.fore_color.rgb = COLOR_PRIMARY
    bg12.line.fill.background()
    
    badge_end = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.4), Inches(2.8), Inches(0.4))
    badge_end.fill.solid()
    badge_end.fill.fore_color.rgb = COLOR_SECONDARY
    badge_end.line.fill.background()
    be_tf = badge_end.text_frame
    be_p = be_tf.paragraphs[0]
    be_p.text = "Q & A SESSION"
    be_p.alignment = PP_ALIGN.CENTER
    be_p.font.name = "Pretendard"
    be_p.font.size = Pt(11)
    be_p.font.bold = True
    be_p.font.color.rgb = COLOR_WHITE
    
    end_title = s12.shapes.add_textbox(Inches(1.2), Inches(2.0), Inches(11.0), Inches(1.6))
    et_tf = end_title.text_frame
    et_tf.word_wrap = True
    et_p1 = et_tf.paragraphs[0]
    et_p1.text = "“곡을 만드는 사람에게,\n발매 준비까지 혼자 맡기지 않도록.”"
    et_p1.font.name = "Pretendard"
    et_p1.font.size = Pt(36)
    et_p1.font.bold = True
    et_p1.font.color.rgb = COLOR_WHITE
    et_p1.space_after = Pt(12)
    
    end_desc = s12.shapes.add_textbox(Inches(1.2), Inches(4.0), Inches(11.0), Inches(1.0))
    ed_tf = end_desc.text_frame
    ed_p = ed_tf.paragraphs[0]
    ed_p.text = "발매로는 인디 창작자가 음악 본연에만 집중할 수 있는 환경을 만듭니다. 경청해 주셔서 감사합니다."
    ed_p.font.name = "Pretendard"
    ed_p.font.size = Pt(15)
    ed_p.font.color.rgb = RGBColor(199, 210, 254)
    
    qa_card = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(5.2), Inches(10.933), Inches(1.4))
    qa_card.fill.solid()
    qa_card.fill.fore_color.rgb = RGBColor(49, 46, 129)
    qa_card.line.color.rgb = COLOR_SECONDARY
    qa_tf = qa_card.text_frame
    qa_tf.margin_left = Inches(0.3)
    qa_tf.margin_top = Inches(0.2)
    
    qp1 = qa_tf.paragraphs[0]
    qp1.text = "💬 심사위원 질의응답 (5분) 진행 안내"
    qp1.font.name = "Pretendard"
    qp1.font.size = Pt(13)
    qp1.font.bold = True
    qp1.font.color.rgb = COLOR_WHITE
    qp1.space_after = Pt(4)
    
    qp2 = qa_tf.add_paragraph()
    qp2.text = "• 서비스 링크: https://codyssey-m2-1.vercel.app  |  코드 저장소: github.com/davidchoi0507/Codyssey_M2-1"
    qp2.font.name = "Pretendard"
    qp2.font.size = Pt(11)
    qp2.font.color.rgb = RGBColor(226, 232, 240)

    s12.notes_slide.notes_text_frame.text = (
        "[09:45 - 10:00] 발표 마무리 및 Q&A 전환 스크립트\n"
        "“'곡을 만드는 사람에게, 발매 준비까지 혼자 맡기지 않도록' - 이것이 저희 팀이 5개월의 여정 끝에 완성한 발매로의 약속입니다.\n"
        "이상으로 발표를 마치고, 심사위원분들의 질문에 성심껏 답변드리겠습니다. 감사합니다.”"
    )

    output_path = "c:\\Users\\david\\Desktop\\Codyssey\\M2-1\\balmaero_presentation.pptx"
    prs.save(output_path)
    print(f"SUCCESS: {output_path}")

if __name__ == "__main__":
    create_balmaero_presentation()
