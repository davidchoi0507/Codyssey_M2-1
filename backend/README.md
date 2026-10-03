# 인디 앨범 스튜디오 — 백엔드

곡을 올리면 librosa(수치) + Gemini(듣기) → A&R 노트를 만드는 백엔드. FastAPI, Docker.
팀 전달·요청 사항: [`TEAM_HANDOFF.md`](TEAM_HANDOFF.md)

## 준비

1. Docker Desktop 실행
2. `backend/.env.example` → `backend/.env` 복사 후 키 입력 (**`.env`는 절대 커밋 금지**)
3. 테스트 음원은 레포 최상위 `samples/` 폴더에 (git 제외됨)

## 곡 1개 실행 (CLI)

```bash
cd backend
docker compose build                     # 처음 한 번, requirements 바뀔 때
docker compose run --rm api python -m scripts.run_job /samples/곡.wav \
    --title "곡 제목" --artist "밴드" --genre "인디록" --description "곡 소개" \
    [--lyrics-file /samples/가사.txt] --consent-confirmed
```

- `--consent-confirmed`: 밴드에게 필수 동의를 받았다는 확인. 없으면 처리하지 않음
- 실패하면 마지막 줄에 나오는 명령으로 **실패한 단계부터** 이어서 실행:
  `docker compose run --rm api python -m scripts.run_job --resume <job_id>`
- Windows Git Bash에서는 명령 앞에 `MSYS_NO_PATHCONV=1` 을 붙여야 `/samples/...` 경로가 깨지지 않음

## 결과 보기

```bash
docker compose run --rm api python -m scripts.show_job              # 작업 목록
docker compose run --rm api python -m scripts.show_job <job_id>     # 요약 출력
docker compose run --rm api python -m scripts.show_job <job_id> --html
```

`--html`을 붙이면 `data/jobs/<job_id>/report.html`이 생깁니다. 브라우저로 열면
파형 위 하이라이트 후보 표시, 후보 구간 ▶ 듣기, 색 견본, Gemini가 들은 내용까지 한 화면에서 볼 수 있습니다.

결과 파일 (`data/jobs/<job_id>/`)

| 파일 | 내용 |
| --- | --- |
| `input/original.flac` (.mp3) | 원본. WAV는 무손실 FLAC으로 저장 |
| `input/analysis.mp3` | Gemini 전송용 압축본 (모노 16kHz 64kbps) |
| `analysis/features.json` | librosa 수치·파형·하이라이트 후보 |
| `analysis/listening.json` | Gemini 듣기 결과 + 사용 모델·토큰 |
| `note/note_v1.json` | **A&R 노트 (API 응답 형식)** |
| `events.jsonl` | 단계별 소요 시간·실패 기록 (지표) |
| `status.json` | 현재 단계 |

## 구조

```
app/
  core/       config.py(환경변수) · stages.py(단계 문구) · errors.py(한국어 에러)
  schemas/    API 요청·응답 형식 — 형식은 여기에만 정의
  analysis/   ffmpeg 변환, librosa 분석
  adapters/   gemini.py, codyssey_llm.py (외부 API)
  agents/     ar.py (A&R 노트)
  prompts/    *.md 프롬프트
  pipeline/   단계 실행·저장·이어하기
scripts/      run_job.py, show_job.py
```

- 모델명·한도는 전부 `.env` (gemini-2.5-flash, dall-e-3는 설정 단계에서 차단)
- 코디세이 API는 JSON 모드를 지원하지 않아, 프롬프트로 JSON을 받고 파서로 검증합니다
