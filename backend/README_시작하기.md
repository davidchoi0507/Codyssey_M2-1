# 시작 파일 사용법

1. 이 폴더의 내용을 레포 루트에 복사한다 (`CLAUDE.md`, `docs/`, `.env.example`, `.gitignore`).
2. `.env.example`을 `.env`로 복사하고 키와 모델명을 채운다.
3. `samples/` 폴더를 만들고 테스트 음원을 넣는다 (한국어 보컬 곡 1~2곡 포함).
4. 레포 루트에서 `claude` 실행 → `docs/KICKOFF_PROMPT.md`의 첫 프롬프트를 붙여넣는다.

파일 설명
- `CLAUDE.md` — Claude Code가 매 세션 자동으로 읽는 프로젝트 컨텍스트와 규칙
- `docs/PROJECT_BRIEF.md` — 서비스 기획 (문제, 차별점, 흐름, 결과물, 윤리, 평가)
- `docs/ARCHITECTURE.md` — 구조, 디렉터리, 파일 저장, 분석·생성·동시성
- `docs/API_CONTRACT.md` — 화면별 API와 JSON 초안 (10/5 팀장과 확정)
- `docs/SCHEDULE.md` — 10/4~10/20 일정, 10/8 테스트 버전 범위, 받아야 할 것
- `docs/DECISIONS.md` — 기술 선택 이유 (결과보고서·발표용)
- `docs/KICKOFF_PROMPT.md` — 첫 세션 프롬프트와 이후 세션 문장
