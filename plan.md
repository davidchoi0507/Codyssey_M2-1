# M2-1 최종 프로젝트 계획서: 인디 앨범 스튜디오 (Indie Album Studio)

> **오디오 멀티모달 & Multi-Agent 기반 인디 뮤지션 올인원 AI 앨범 브랜딩 및 비주얼 에셋 서비스**  
> *"음원 파일 하나로 완성하는 A&R 기획서, 앨범 아트워크 3종, 주파수 반응형 비주얼라이저, 그리고 발매 홍보 패키지"*

---

## 1. 프로젝트 개요 (Project Overview)

### 1.1 기획 배경 및 문제 정의 (Problem Definition)
* **인디 뮤지션의 비주얼 브랜딩 외주 비용 부담:** 1인 창작자 및 소규모 인디 뮤지션은 고품질 음원을 완성하고도 앨범 커버(30~100만 원), 숏폼 비주얼라이저(50~150만 원) 등의 외주 비용과 디렉팅 역량 부족으로 발매 단계에서 심각한 병목을 겪습니다.
* **단절된 생성 워크플로우의 한계:** 기존 생성형 AI 툴들은 음악의 청각적 느낌을 텍스트 프롬프트로 일일이 묘사해야 하며, 이미지/영상/카피라이팅 서비스가 파편화되어 있어 작업 연속성이 떨어집니다.
* **청각-시각 간의 감성 불일치:** 텍스트 설명만으로 이미지를 생성할 경우 실제 음악의 템포(BPM), 에너지 다이내믹스, 주파수 밝기(Spectral Centroid)와 어긋난 이질적인 비주얼이 도출됩니다.

### 1.2 해결 방안 및 핵심 가치 (Value Proposition)
**"인디 앨범 스튜디오"**는 실제 음원 파일(`.mp3`, `.wav`)을 업로드하면, **[오디오 DSP 물리량 + Gemini 2.5 Flash 청각 분석]**의 하이브리드 멀티모달 파이프라인을 통해 곡의 본질을 파악하고, **Multi-Agent 시스템**이 협업하여 **3분 이내**에 다음 4대 결과물을 일괄 생성하는 통합 웹 플랫폼입니다.

1. **A&R 콘셉트 기획서:** 곡의 무드 서사, 추천 컬러 팔레트 5종, 비주얼 사조 키워드
2. **고화질 앨범 아트워크 3종:** DALL-E 3 기반 상호 다른 3가지 스타일(미니멀, 사이키델릭, 시네마틱) 커버
3. **오디오 반응형 숏폼 비주얼라이저:** 선택한 커버와 음원 주파수(Bass/Treble)에 실시간 반응하는 1:1 Canvas 모션
4. **발매 홍보 패키지 & 이메일 자동 발송:** 멜론/스포티파이용 트랙 소개글, 인스타그램 릴리즈 카피 + ZIP 다운로드 + **완성 에셋 팩 이메일(Resend) 자동 발송 & 브라우저 알림**

---

## 2. 과제 핵심 기술 요건 충족 분석 (`guide.md` 기준)

본 프로젝트는 `guide.md`의 5대 필수 기술 요소 중 **3대 핵심 기술 요건**을 유기적으로 결합하여 높은 완성도와 평가 차별성을 확보합니다.

| 필수 기술 요건 | 본 프로젝트 적용 방식 및 아키텍처 | 구현 목표 및 평가 차별성 |
| :--- | :--- | :--- |
| **멀티모달 AI (Multimodal)** | **2-Track 하이브리드 오디오 분석**<br>① `librosa` 물리량 추출 (BPM, Spectral Centroid, RMS 에너지)<br>② `Gemini 2.5 Flash` 오디오 청각 분석 (보컬 톤, 감정선, 악기 구성)<br>➔ DALL-E 3(시각 에셋) 및 카피라이팅(텍스트) 생성 | 단순 텍스트 프롬프트 의존 탈피.<br>청각적 데이터와 시각 디자인의 **공감각적 정합성 100% 보장** |
| **AI Agent (Multi-Agent)** | **LangGraph 기반 ReAct Tool-Calling 에이전트**<br>• A&R 기획 Agent (`AudioAnalysisTool` 활용)<br>• 비주얼 디렉터 Agent (`ArtTrendSearchTool` 웹 검색 도구 활용)<br>• 품질 검증 Agent (`PromptValidatorTool` 금지어 검증)<br>• 마케팅 카피라이터 Agent | 단순 순차 프롬프트 호출(Chaining)을 넘어, **자율적으로 도구를 활용(Tool Use)**하여 결과를 도출하는 자율 에이전트 구현 |
| **자동화 워크플로우 (Workflow)** | **엔드투엔드 비동기 처리 & 이메일/알림 자동화 파이프라인**<br>• FastAPI Background Tasks 기반 `task_id` 발행 및 비동기 Polling<br>• 렌더링 완료 시 **브라우저 푸시 알림(Web Notification)** 및 **Resend API 기반 릴리즈 팩 이메일 자동 발송**<br>• 원클릭 **ZIP 번들 자동 압축 패키징** 파이프라인 | 대용량 렌더링 시 브라우저 타임아웃 방지 및 **사용자 이탈 없는 현실적인 이메일 발송 자동화 완비** |

---

## 3. 시스템 아키텍처 및 엔드투엔드 데이터 흐름도

```
[1. User Input Tier (Web Frontend - Vercel)]
  ├─ 음원 파일 업로드 (.mp3, .wav / 앞부분 60초 집중 분석)
  ├─ 곡 기본 정보 입력 (곡 제목, 아티스트명, 장르 태그, 가사 또는 곡 소개)
  ├─ 결과 수신용 이메일 입력 (옵션: 완성 시 이메일로 릴리즈 팩 자동 전송)
  └─ AI 윤리 고지 및 자작곡 확인 체크박스
            │
            ▼ (HTTP POST Multipart / 비동기 task_id 즉시 발급)
[2. Hybrid Audio Multimodal Engine (FastAPI)]
  ├─ [Track A] librosa DSP 파싱: BPM, Spectral Centroid(밝기), RMS(에너지) 수치화
  └─ [Track B] Gemini 2.5 Flash Audio API: 곡의 무드, 보컬 질감, 악기 세션 정성 분석
            │
            ▼ (Audio Feature Profile JSON 생성)
[3. Tool-Calling Multi-Agent Orchestration Tier (LangGraph)]
  ├─ [Agent 1: A&R Planner] ──➔ Tool: AudioAnalysisTool (수치 및 정성 분석 데이터 조회)
  ├─ [Agent 2: Visual Director] ──➔ Tool: VisualTrendSearchTool (장르별 최신 비주얼 트렌드 검색)
  ├─ [Agent 3: Quality Checker] ──➔ Tool: PromptValidatorTool (DALL-E 금지어 필터링)
  └─ [Agent 4: Copywriter] ──➔ 멜론/스포티파이 소개글 및 인스타그램 홍보 캡션 생성
            │
            ▼
[4. Asset Generation & Rendering Tier]
  ├─ Image Engine: DALL-E 3 API (1024x1024 정방형 아트워크 3종 병렬 생성 / Mock 모드 지원)
  ├─ Visualizer Engine: Web Audio API (AnalyserNode) + Canvas 2D 주파수 반응형 모션
  └─ Automation Pipeline: Resend API 이메일 자동 발송 + 브라우저 시스템 알림 + JSZip 번들 패키징
            │
            ▼
[5. Web Presentation & Export Tier]
  ├─ 30초 대기 중 감각적인 오디오 분석 지표 로딩 애니메이션 (Polling)
  ├─ 올인원 3단 분할 대시보드 (기획서 / 커버 3종 갤러리 / 비주얼라이저 / 카피)
  └─ 원클릭 ZIP 번들 다운로드 및 AI Generated 저작권 가이드라인 표시
```

---

## 4. 서비스 핵심 기능 명세서 (MVP Specification)

| 기능 ID | 기능명 | 상세 설명 및 입출력 기준 | 우선순위 | 담당 포지션 |
| :--- | :--- | :--- | :---: | :--- |
| **F-01** | 음원 업로드 & 하이브리드 오디오 분석 | • 입력: `.mp3`, `.wav` (앞 60초 클립 분석으로 속도 극대화)<br>• 처리: `librosa` 물리량 추출 + `Gemini 2.5 Flash` 감정선 분석<br>• 출력: 음원 기본 스펙 카드 UI 표시 (BPM, 주파수 밝기 등) | **Must** | 팀원 1 |
| **F-02** | Tool-Calling Multi-Agent 브랜딩 기획 | • 입력: 오디오 분석 JSON 프로필 + 가사/곡 소개<br>• 처리: 도구(Tool)를 활용한 A&R 콘셉트, 비주얼 키워드, 스타일 프롬프트 3종 도출<br>• 출력: 구조화된 JSON 기반 기획 리포트 | **Must** | 팀원 1 |
| **F-03** | AI 앨범 아트워크 3종 생성 | • 입력: 최적화된 비주얼 프롬프트 3종 (미니멀, 사이키델릭, 시네마틱)<br>• 처리: DALL-E 3 API 비동기 호출 (개발 중에는 Mock Image 모드 토글)<br>• 출력: 3종 고화질 커버 갤러리 및 선택 UI | **Must** | 팀장 & 팀원 3 |
| **F-04** | 오디오 반응형 숏폼 비주얼라이저 | • 입력: 업로드된 음원 + 선택된 커버 아트워크<br>• 처리: Web Audio API `AnalyserNode` + Canvas 2D 실시간 파형 애니메이션<br>• 출력: 음악 재생 시 베이스/비트에 맞춰 펄스가 뛰는 1:1 모션 캔버스 | **Must** | 팀장 & 팀원 2 |
| **F-05** | 발매 홍보 패키지 & 이메일 자동 발송 | • 입력: A&R 기획 서사 데이터 + 사용자 이메일<br>• 처리: 플랫폼별 카피 생성, ZIP 압축 패키징, Resend API 완성 이메일 자동 발송, 브라우저 시스템 알림<br>• 출력: 카피 원클릭 복사, ZIP 다운로드, 이메일 수신 확인 | **Must** | 팀원 3 |
| **F-06** | AI 윤리 & 실사용자 피드백 루프 | • 처리: AI 생성물 워터마크 메타데이터 표기, 저작권 자작곡 확약 체크<br>• 실사용자 5인 테스트 피드백 수집 및 전/후 개선 리포트 | **Must** | 팀원 4 |

---

## 5. 기술 스택 및 배포 인프라 (Tech Stack & Infra)

복잡한 인프라 설정으로 인한 일정 지연을 방지하기 위해 **검증된 무료/저비용 클라우드 서비스**를 채택합니다.

* **Frontend:** HTML5, CSS3, Vanilla JavaScript, Web Audio API, Canvas 2D, Web Notification API
  * **호스팅:** **Vercel** (GitHub 푸시 시 1분 내 자동 빌드, 무료 도메인 `indie-studio.vercel.app`, 자동 SSL 제공)
* **Backend API:** Python 3.10+, FastAPI, Uvicorn, Pydantic
  * **호스팅:** **Render** (Python Web Service 배포 용이, 무료/엔트리 플랜, 환경변수 격리 및 자동 HTTPS)
* **Audio & Multimodal AI:** `librosa`, `soundfile`, `Gemini 2.5 Flash` (Native Audio Input)
* **Agent & Image Generation:** LangGraph / LangChain, OpenAI DALL-E 3, GPT-4o-mini
* **Automation & DevOps:** Resend API (이메일 자동 발송), GitHub Actions, JSZip

---

## 6. 팀 구성 및 상세 역할 분담 (R&R)

5인 팀원의 역량 차이를 효과적으로 흡수하고, **모든 팀원이 GitHub 커밋과 동료 평가에서 실질적 기여도를 100% 인정받을 수 있도록 설계된 분업 구조**입니다.

### 👤 본인 (팀장 / 상급자 / 디자인 전공)
* **포지션:** **Product Lead & Lead UI/UX Engineer (Creative Director)**
* **상세 담당 업무:**
  1. **UI/UX 디자인 시스템 구축:** Ableton/Spotify 감성의 다크 테마(#0F1015 / #1A1D26) 와이어프레임 설계
  2. **프론트엔드 코어 구현:** 랜딩 페이지, 음원 드래그앤드롭 업로더, 3단 분할 대시보드 레이아웃 마크업
  3. **크리에이티브 비주얼 디렉팅:** DALL-E 3 아트 무브먼트(미니멀, 사이키델릭, 시네마틱) 프롬프트 정밀 튜닝
  4. **스프린트 및 형상 관리:** 6주 일정 관리, GitHub 마일스톤 설정 및 PR 코드 리뷰/머지 총괄
* **평가 기여도 증빙 산출물:** 디자인 에셋 및 프론트엔드 레이아웃 코드 커밋, 비주얼 프롬프트 엔지니어링 최적화 로그

### 👤 팀원 1 (상급자 / 개발 에이스)
* **포지션:** **Tech Lead & AI / Backend Architect**
* **상세 담당 업무:**
  1. **FastAPI 백엔드 아키텍처:** REST API 설계, 멀티파트 오디오 스트리밍 수신 및 Render 서버 배포
  2. **오디오 하이브리드 엔진:** `librosa` 물리량 추출(BPM, 밝기) + `Gemini 2.5 Flash` 정성 분석 파이프라인
  3. **LangGraph Multi-Agent 구축:** Tool-calling 기반 A&R 및 비주얼 디렉터 ReAct 에이전트 구현
  4. **비동기 큐 설계:** Background Tasks 기반 `task_id` 발행 및 작업 진행 상태 조회 엔드포인트 구현
* **평가 기여도 증빙 산출물:** 백엔드 코어 API, 오디오 DSP/멀티모달 모듈 커밋, 시스템 아키텍처 다이어그램

### 👤 팀원 2 (적당히 보통 / 프론트 서포트)
* **포지션:** **Frontend Engineer (Audio-Visual & Interaction)**
* **상세 담당 업무 (팀장의 UI 가이드 기반 로직 구현):**
  1. **Canvas 2D 비주얼라이저 구현:** Web Audio API `AnalyserNode`를 활용한 주파수 반응형 오디오 파형/펄스 애니메이션
  2. **비동기 상태 Polling 연동:** 백엔드 `task_id` 상태를 3초 주기로 조회하여 로딩 진행률(Progress Bar) 실시간 갱신
  3. **클라이언트 인터랙션:** 아트워크 고화질 모달 뷰어, 브라우저 시스템 알림(Web Notification), 클립보드 복사
* **평가 기여도 증빙 산출물:** 비주얼라이저 캔버스 코드, API 통신 인터랙션 스크립트 커밋

### 👤 팀원 3 (적당히 보통 / 백엔드 서포트)
* **포지션:** **AI Workflow & Auxiliary Backend Engineer**
* **상세 담당 업무 (코어 백엔드와 분리된 독립 모듈 구현):**
  1. **DALL-E 3 연동 및 Mocking:** 비동기 이미지 생성 호출 모듈 작성 및 비용 절감용 `MOCK_MODE` 스위치 구현
  2. **자동화 워크플로우 구축:** Resend API 기반 완성 릴리즈 팩 이메일 자동 발송 및 `JSZip` 패키징 로직 구현
  3. **카피라이팅 에이전트 프롬프트:** 멜론 트랙 소개글 및 인스타그램 홍보 캡션 생성 프롬프트 및 JSON 유효성 검증
* **평가 기여도 증빙 산출물:** DALL-E 연동 코드, Resend 이메일 자동화 파이프라인 커밋, 홍보 카피 모듈

### 👤 팀원 4 (초급·비개발 / 운영 및 품질 총괄)
* **포지션:** **Product Operations, QA & Ethics Lead**
* **상세 담당 업무 (과제 합격 필수 요건 전담):**
  1. **실사용자 5인 테스트 총괄 (과제 필수):** 인디 뮤지션/창작자 5인 섭외, 사용성 테스트 진행, 전/후 개선 보고서 작성
  2. **오디오 테스트 데이터셋 구축:** 저작권 프리 인디 음원 샘플 20곡(장르별) 수집 및 정량 메타데이터 DB(JSON) 정리
  3. **QA 및 이슈 트래킹:** 비정상 파일 업로드, 네트워크 지연 등 예외 상황 테스트 및 GitHub Issues 등록
  4. **AI 윤리 및 최종 산출물 완성:** AI Generated 고지 약관 작성, `README.md` 최종 취합, 발표 PPT 제작
* **평가 기여도 증빙 산출물:** 실사용자 5인 피드백 보고서(심사 핵심), 테스트 데이터셋 JSON, GitHub Issue 등록 내역

---

## 7. 6주 개발 마일스톤 및 스프린트 계획

| 주차 | 스프린트 목표 | 세부 실행 과업 (5인 협업) | 주차별 완료 산출물 |
| :---: | :--- | :--- | :--- |
| **1주차** | **기획 확정 & 기술 PoC** | • 팀장: 다크 테마 웹 UI 프로토타입 및 Git 브랜치 룰 수립<br>• 팀원 1: librosa & Gemini 2.5 Flash 오디오 분석 PoC 스크립트 작성<br>• 팀원 2/3: Canvas 2D 비주얼라이저 예제 및 DALL-E 3 Mocking 테스트<br>• 팀원 4: 테스트 음원 데이터셋 20종 수집 및 Git 커밋 | • 요구사항 정의서<br>• 프로토타입 UI 뼈대<br>• 음원 분석 PoC 코드 |
| **2주차** | **백엔드 코어 & 에이전트** | • 팀원 1: FastAPI 백엔드 구축 및 LangGraph Tool-calling 에이전트 연동<br>• 팀장: 프론트엔드 메인 레이아웃 및 업로더 컴포넌트 마크업 완성<br>• 팀원 3: 카피라이팅 프롬프트 작성 및 Resend 이메일 연동<br>• 팀원 4: QA 체크리스트 작성 및 AI 윤리/저작권 가이드라인 수립 | • 백엔드 API 서버<br>• Multi-Agent 파이프라인<br>• 프론트엔드 UI 뼈대 |
| **3주차** | **프론트-백 연동 & 비주얼** | • 팀장 & 팀원 2: 3단 대시보드 UI 완성 및 비동기 Polling 상태 연동<br>• 팀원 2: Canvas 2D 주파수 반응형 비주얼라이저 구현<br>• 팀원 1 & 3: DALL-E 3 생성 파이프라인과 비동기 백그라운드 큐 결합<br>• 팀원 4: 1차 통합 빌드 기능 테스트 및 버그 이슈 등록 | • 프론트-백 통합 빌드<br>• 비주얼라이저 연동 완료 |
| **4주차** | **클라우드 배포 & 패키징** | • 팀원 1 & 팀장: Vercel(Front) 및 Render(Back) 라이브 배포 완료<br>• 팀원 3: 원클릭 ZIP 번들 압축 다운로드 및 이메일 자동 발송 연동<br>• 팀원 2: 고화질 갤러리 프리뷰 및 브라우저 알림 디테일 폴리싱<br>• 팀원 4: 외부 접속 테스트 및 실사용자 5인 인터뷰 섭외 완료 | • **외부 공개 라이브 URL**<br>• ZIP 번들 다운로드 기능 |
| **5주차** | **실사용자 5인 테스트 & 개선** | • 팀원 4: **인디 뮤지션 5인 대상 사용성 테스트 진행 및 설문 취합**<br>• 전원: 피드백 기반 기능 개선 (UI 속도 최적화, 프롬프트 튜닝 등)<br>• 팀장 & 팀원 1: 피드백 반영 2차 배포 및 Before & After 개선점 정리 | • **실사용자 피드백 보고서**<br>• 피드백 반영 2차 개선 빌드 |
| **6주차** | **최종 산출물 & 발표 준비** | • 팀원 4: 최종 발표 자료(PPT) 및 데모 시연 영상(2~3분) 제작<br>• 팀장: GitHub `README.md` 최종 정리 (아키텍처, 역할, 실행법, 배포링크)<br>• 전원: 질의응답 시뮬레이션 및 최종 패키지 제출 | • 최종 제출 패키지 6종<br>• 발표 PPT 및 시연 영상 |

---

## 8. 기술적 리스크 관리 및 비용 제어 전략

1. **API 비용 $0 방어 전략 (Mock Mode):**
   * DALL-E 3는 1회(3장) 호출 시 약 160원의 비용이 발생합니다.
   * 백엔드 환경변수에 `MOCK_MODE=True`를 설정하여, **개발 및 UI 테스트 기간에는 Unsplash 음악 관련 고화질 이미지를 반환**하도록 구현합니다.
   * 실사용자 테스트(5주차) 및 최종 시연 시에만 실 API를 호출하여 전체 프로젝트 API 비용을 1만 원 이내로 방어합니다.
2. **오디오 분석 지연 시간 최적화:**
   * 5분 이상의 전체 음원을 분석하면 메모리 부족 및 타임아웃이 발생할 수 있습니다.
   * 백엔드에서 오디오를 로드할 때 `librosa.load(file, duration=60)` 옵션을 적용하여 **곡의 도입~하이라이트 60초만 분석**함으로써 분석 시간을 2초 이내로 단축합니다.
3. **렌더링 방식 경량화 (Three.js 배제 ➔ Canvas 2D 채택):**
   * 3D WebGL(Three.js) 대신 **HTML5 Canvas 2D 기반의 원형 오디오 바 및 펄스 모션**을 채택하여 브라우저 사양에 구애받지 않고 60fps 무지연 렌더링을 보장합니다.

---

## 9. 팀 프로젝트 협업 및 Git 가이드라인

* **브랜치 전략 (Git-flow 경량화):**
  * `main`: 프로덕션 배포 브랜치 (Vercel/Render 자동 배포 연결)
  * `develop`: 팀 통합 개발 브랜치
  * `feat/기능명`: 개인 작업 브랜치 (예: `feat/audio-dsp`, `feat/canvas-visualizer`)
* **PR 룰:** 모든 `feat` 브랜치는 팀장의 코드 리뷰 후 `develop`에 머지하며, 모든 팀원이 주 최소 3회 이상 커밋을 남겨 GitHub 기여도를 증명합니다.