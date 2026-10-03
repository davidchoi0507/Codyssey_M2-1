"""CLI: 곡 1개 → A&R 노트까지 (10/8 대행 테스트용, 화면 없이 팀이 대신 실행).

새 작업:
  python -m scripts.run_job /samples/song.wav --title "곡 제목" --artist "밴드" --genre 인디록 \
      --description "곡 소개" [--lyrics-file /samples/lyrics.txt] --consent-confirmed
이어서 (실패한 단계부터):
  python -m scripts.run_job --resume <job_id>
"""
import argparse
import asyncio
import json
import logging
import shutil
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from app.analysis.audio_io import probe_duration
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.pipeline.analyze import run_analysis
from app.pipeline.jobfiles import JobFiles, new_job_id, now_iso

ALLOWED_EXT = {".mp3", ".wav"}
CLI_CONSENT_VERSION = "cli-offline-v1"  # 동의는 대행 테스트 시 별도 양식으로 받음


def create_job(args, settings) -> JobFiles:
    src = Path(args.audio)
    if not src.exists():
        raise AppError("FILE_NOT_FOUND", f"파일이 없어요: {src}", False)
    if src.suffix.lower() not in ALLOWED_EXT:
        raise AppError("UNSUPPORTED_FORMAT", "mp3나 wav 파일만 올릴 수 있어요.", False)
    if not args.consent_confirmed:
        raise AppError("CONSENT_REQUIRED",
                       "필수 동의(자작곡 확약, 개인정보 7일 보관, Gemini 음원 전송·학습 가능성 고지)를 받은 뒤 "
                       "--consent-confirmed 를 붙여 실행해 주세요.", False)
    duration = probe_duration(src)
    if duration > settings.max_duration_sec:
        raise AppError("TOO_LONG", f"{settings.max_duration_sec // 60}분 이하 곡만 처리할 수 있어요.", False)
    size_mb = src.stat().st_size / 1024 / 1024
    if size_mb > settings.max_upload_mb:
        # 업로드 API에서는 막지만, 대행 CLI는 경고만 하고 진행
        print(f"[경고] {size_mb:.0f}MB — 업로드 한도({settings.max_upload_mb}MB)를 넘는 파일이에요.", file=sys.stderr)

    jf = JobFiles(settings.jobs_dir, new_job_id())
    dst = jf.original(src.suffix.lower())
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

    lyrics = Path(args.lyrics_file).read_text(encoding="utf-8") if args.lyrics_file else None
    jf.write_json(jf.song, {"title": args.title, "artist": args.artist, "genre": args.genre,
                            "description": args.description, "lyrics": lyrics})
    jf.write_json(jf.consent, {
        "version": CLI_CONSENT_VERSION, "at": now_iso(),
        "consent_original": True, "consent_privacy": True, "consent_external_ai": True,
        "consent_showcase": args.consent_showcase, "gemini_tier": settings.gemini_tier,
    })
    jf.set_status(Stage.UPLOADED)
    jf.event("uploaded", size_mb=round(size_mb, 1), duration_sec=round(duration, 1), source="cli")
    return jf


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
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    try:
        if args.resume:
            jf = JobFiles(settings.jobs_dir, args.resume)
            if not jf.root.exists():
                raise AppError("JOB_NOT_FOUND", f"작업을 찾을 수 없어요: {args.resume}", False)
        elif args.audio:
            jf = create_job(args, settings)
        else:
            p.error("음원 경로 또는 --resume <job_id> 가 필요해요.")

        print(f"job_id: {jf.job_id}", file=sys.stderr)
        t = time.monotonic()
        with ProcessPoolExecutor(max_workers=settings.cpu_workers) as pool:
            note = await run_analysis(settings, jf, pool)
        print(f"완료: {time.monotonic() - t:.1f}초 → {jf.note(note.version)}", file=sys.stderr)
        print(json.dumps(note.model_dump(), ensure_ascii=False, indent=1))
        return 0
    except AppError as e:
        print(f"[{e.code}] {e.message} (재시도 {'가능' if e.retryable else '불가'})", file=sys.stderr)
        if e.retryable and 'jf' in locals():
            print(f"이어서 실행: python -m scripts.run_job --resume {jf.job_id}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
