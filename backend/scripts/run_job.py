"""CLI: 곡 1개 → A&R 노트까지 (10/8 대행 테스트용, 화면 없이 팀이 대신 실행).

새 작업:
  python -m scripts.run_job /samples/song.wav --title "곡 제목" --artist "밴드" --genre 인디록 \
      --description "곡 소개" [--lyrics-file /samples/lyrics.txt] --consent-confirmed
이어서 (실패한 단계부터):
  python -m scripts.run_job --resume <job_id>
노트를 수락하고 커버 3종 + 채널 카피 생성:
  python -m scripts.run_job --resume <job_id> --accept
"""
import argparse
import asyncio
import json
import logging
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError
from app.pipeline.analyze import run_analysis
from app.pipeline.generate import accept_note, run_generation
from app.pipeline.intake import create_job
from app.pipeline.jobfiles import JobFiles

CLI_CONSENT_VERSION = "cli-offline-v1"  # 동의는 대행 테스트 시 별도 양식으로 받음


def create_cli_job(args, settings) -> JobFiles:
    src = Path(args.audio)
    if not src.exists():
        raise AppError("FILE_NOT_FOUND", f"파일이 없어요: {src}", False)
    if not args.consent_confirmed:
        raise AppError("CONSENT_REQUIRED",
                       "필수 동의(자작곡 확약, 개인정보 7일 보관, Gemini 음원 전송·학습 가능성 고지)를 받은 뒤 "
                       "--consent-confirmed 를 붙여 실행해 주세요.", False)
    lyrics = Path(args.lyrics_file).read_text(encoding="utf-8") if args.lyrics_file else None
    song = {"title": args.title, "artist": args.artist, "genre": args.genre,
            "description": args.description, "lyrics": lyrics}
    consent = {"consent_original": True, "consent_privacy": True, "consent_external_ai": True,
               "consent_showcase": args.consent_showcase, "consent_version": CLI_CONSENT_VERSION}
    # 대행 CLI는 업로드 한도를 적용하지 않음 (길이 10분 제한은 적용)
    return create_job(settings, src, filename=src.name, song=song, consent=consent, source="cli",
                      enforce_size=False)


async def main() -> int:
    p = argparse.ArgumentParser(description="곡 1개 → A&R 노트")
    p.add_argument("audio", nargs="?")
    p.add_argument("--resume", metavar="JOB_ID")
    p.add_argument("--title", default="제목 없음")
    p.add_argument("--artist", default="")
    p.add_argument("--genre", default="")
    p.add_argument("--description", default="")
    p.add_argument("--lyrics-file")
    p.add_argument("--consent-confirmed", action="store_true")
    p.add_argument("--consent-showcase", action="store_true", help="발표 사용 동의 (선택)")
    p.add_argument("--accept", action="store_true", help="노트 수락 후 커버·카피 생성까지")
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    try:
        if args.resume:
            jf = JobFiles(settings.jobs_dir, args.resume)
            if not jf.exists():
                raise AppError("JOB_NOT_FOUND", f"작업을 찾을 수 없어요: {args.resume}", False)
        elif args.audio:
            jf = create_cli_job(args, settings)
        else:
            p.error("음원 경로 또는 --resume <job_id> 가 필요해요.")

        print(f"job_id: {jf.job_id}", file=sys.stderr)
        t = time.monotonic()
        with ProcessPoolExecutor(max_workers=settings.cpu_workers) as pool:
            note = await run_analysis(settings, jf, pool)
        print(f"노트 완료: {time.monotonic() - t:.1f}초 → {jf.note(note.version)}", file=sys.stderr)
        if args.accept and not jf.accepted.exists():
            accept_note(jf)
        if jf.accepted.exists():
            t = time.monotonic()
            await run_generation(settings, jf)
            print(f"생성 완료: {time.monotonic() - t:.1f}초 → {jf.root / 'covers'}, {jf.root / 'channels'}",
                  file=sys.stderr)
        else:
            print(json.dumps(note.model_dump(), ensure_ascii=False, indent=1))
        return 0
    except AppError as e:
        print(f"[{e.code}] {e.message} (재시도 {'가능' if e.retryable else '불가'})", file=sys.stderr)
        if e.retryable and 'jf' in locals():
            print(f"이어서 실행: python -m scripts.run_job --resume {jf.job_id}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
