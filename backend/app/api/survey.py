"""마지막 설문 · 화면 사용 기록 (10/14 회의: 피드백은 서버가 자동으로 파악하고, 마지막에 짧게 묻는다)."""
from fastapi import APIRouter, Depends

from app.api.community import OwnerKey, _enabled, _track_id
from app.api.deps import find_job, job_files
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline import community as c
from app.pipeline import survey, usage
from app.pipeline.jobfiles import JobFiles
from app.schemas.survey import SurveyAnswer, SurveyQuestion, SurveyView, UsageEvent

router = APIRouter(tags=["설문·사용 기록"])


def _view(kind: str, subject: str) -> SurveyView:
    saved = survey.load(subject)
    return SurveyView(kind=kind, version=survey.VERSION,
                      questions=[SurveyQuestion(**q) for q in survey.questions(kind)],
                      answers=saved["answers"] if saved else None,
                      answered_at=saved["updated_at"] if saved else None)


def _track_subject(track_id: str, key: str | None, s: Settings) -> tuple[str, str, dict]:
    """곡의 설문 대상. 작업에서 공개했고 작업이 아직 있으면 그 작업의 설문 하나로 모은다 (한 번의 체험 = 응답 하나)."""
    t = c.get_track(_track_id(track_id), include_hidden=True)
    c.check_owner_key(s, track_id, key)
    if t["job_id"]:
        try:
            jf = find_job(t["job_id"])
        except AppError:
            jf = None
        if jf is not None:
            return "release", f"job:{jf.job_id}", usage.job_summary(jf)
    return "community", f"track:{track_id}", {"kind": "community", "track": usage.track_summary(t)}


@router.get("/jobs/{job_id}/survey", response_model=SurveyView, summary="(10/15 추가) 마지막 설문 문항 + 이미 낸 답",
            description="ZIP을 받거나 커뮤니티에 올린 뒤 보여 준다. 답했으면 answers가 채워져 있다.")
def get_job_survey(jf: JobFiles = Depends(job_files)) -> SurveyView:
    return _view("release", f"job:{jf.job_id}")


@router.put("/jobs/{job_id}/survey", response_model=SurveyView, summary="(10/15 추가) 마지막 설문 답 내기 (다시 내면 덮어씀)")
def put_job_survey(body: SurveyAnswer, jf: JobFiles = Depends(job_files)) -> SurveyView:
    survey.save(f"job:{jf.job_id}", survey.clean("release", body.answers), usage.job_summary(jf))
    return _view("release", f"job:{jf.job_id}")


@router.get("/community/tracks/{track_id}/survey", response_model=SurveyView,
            summary="(10/15 추가) 곡 관리 화면의 설문 (X-Owner-Key)",
            description="AI 없이 바로 공개한 곡은 kind=community(발매 준비 문항 없음). 작업에서 공개한 곡은 그 작업의 설문과 같다.")
def get_track_survey(track_id: str, x_owner_key: str | None = OwnerKey, s: Settings = Depends(_enabled)) -> SurveyView:
    kind, subject, _ = _track_subject(track_id, x_owner_key, s)
    return _view(kind, subject)


@router.put("/community/tracks/{track_id}/survey", response_model=SurveyView,
            summary="(10/15 추가) 곡 관리 화면에서 설문 답 내기 (X-Owner-Key)")
def put_track_survey(track_id: str, body: SurveyAnswer, x_owner_key: str | None = OwnerKey,
                     s: Settings = Depends(_enabled)) -> SurveyView:
    kind, subject, summary = _track_subject(track_id, x_owner_key, s)
    survey.save(subject, survey.clean(kind, body.answers), summary)
    return _view(kind, subject)


@router.post("/jobs/{job_id}/usage", response_model=dict, summary="(10/15 추가) 화면 사용 기록 (복사·유통사 사이트 열기 등)",
             description="서버가 알 수 없는 화면 안 동작만 보낸다. 실패해도 화면 동작에는 영향 없게 결과를 기다리지 않아도 된다.")
def post_usage(body: UsageEvent, jf: JobFiles = Depends(job_files)) -> dict:
    usage.event_once(jf, body.event, target=body.target)
    return {"ok": True}
