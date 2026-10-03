"""작업 단계와 화면 표시 문구. 문구를 바꿀 때는 이 파일만 고친다 (팀장 확정 전 임시 문구)."""
from enum import StrEnum


class Stage(StrEnum):
    UPLOADED = "uploaded"
    ANALYZING = "analyzing"
    NOTE_READY = "note_ready"
    GENERATING = "generating"
    AWAITING_COVER = "awaiting_cover"
    RENDERING = "rendering"
    DONE = "done"
    FAILED = "failed"


STAGE_LABELS: dict[Stage, str] = {
    Stage.UPLOADED: "업로드 완료",
    Stage.ANALYZING: "곡을 듣는 중",
    Stage.NOTE_READY: "A&R 노트 확인 대기",
    Stage.GENERATING: "결과물 만드는 중",
    Stage.AWAITING_COVER: "커버 선택 대기",
    Stage.RENDERING: "영상·이미지 만드는 중",
    Stage.DONE: "완료",
    Stage.FAILED: "문제가 생겼어요",
}

# analyzing 단계 안의 세부 진행 (GET /jobs/{id}의 steps)
ANALYSIS_STEPS: list[tuple[str, str]] = [
    ("upload", "업로드"),
    ("measure", "수치 재는 중"),
    ("listen", "곡을 듣는 중"),
    ("note", "해석 쓰는 중"),
]
