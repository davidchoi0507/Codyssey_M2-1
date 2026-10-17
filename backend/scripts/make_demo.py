"""체험 모드 예시 곡 만들기 (서버에서 한 번, 관리자용). 노트까지 끝난 작업을 data/demo/로 복사한다.

  python -m scripts.make_demo <작업 ID>      # 예: 201 '초여름 활주로' 작업
  python -m scripts.make_demo --check        # 준비됐는지만 확인
음원 파일이라 git에 올리지 않는다 (data/는 배포에서 건드리지 않음).
"""
import argparse
import sys

from app.core.config import get_settings
from app.pipeline import demo


def main() -> int:
    p = argparse.ArgumentParser(description="체험 모드 예시 곡 만들기")
    p.add_argument("job_id", nargs="?")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    s = get_settings()
    if not args.check:
        if not args.job_id:
            p.error("작업 ID를 주세요")
        print("만듦:", ", ".join(demo.build_template(s, args.job_id)))
    ok = demo.available(s)
    print("체험 모드:", "준비됨" if ok else "준비 안 됨", f"({demo.template_dir(s)})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
