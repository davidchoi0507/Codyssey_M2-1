"""프롬프트는 이 폴더의 *.md 파일에만 둔다 (코드에 하드코딩 금지)."""
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent


@lru_cache
def load_prompt(name: str) -> str:
    return (_DIR / f"{name}.md").read_text(encoding="utf-8").strip()
