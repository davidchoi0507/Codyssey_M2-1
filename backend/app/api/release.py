"""발매 준비 (2026-10-10 추가): 발매 안내 · 발매 정보 입력 · 권리 자가진단 · 유통사별 판정과 제출 준비표."""
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.api.deps import find_job, job_files, settings
from app.core.config import Settings
from app.core.errors import AppError
from app.core.tokens import make_token, read_token
from app.pipeline import distributors, guide, release_info, rights
from app.pipeline.jobfiles import JobFiles
from app.schemas.release import (DistributorCheck, DistributorProfile, GuideRecommendation, GuideRecommendRequest,
                                 ReleaseInfo, ReleaseInfoView, RightsQuestion, RightsResult)

router = APIRouter(tags=["발매 준비"])


def _dist(dist_id: str) -> str:
    if dist_id not in distributors.PROFILES:
        raise AppError("DISTRIBUTOR_NOT_FOUND", "지원하는 유통사가 아니에요.", False, http_status=404)
    return dist_id


# ---- 누구나 (작업 없이) ----

@router.get("/release/guide", response_model=dict, summary="처음 발매하는 사람용 안내 (단계 설명·유통사·권리 질문)")
def get_guide(s: Settings = Depends(settings)) -> dict:
    return {"steps": guide.STEPS, "distributors": [p.model_dump() for p in distributors.PROFILES.values()],
            "rights_questions": [q.model_dump() for q in rights.QUESTIONS], "service_end_date": s.service_end_date}


@router.post("/release/guide/recommend", response_model=GuideRecommendation, summary="나에게 맞는 유통사 추천")
def recommend(body: GuideRecommendRequest) -> GuideRecommendation:
    return guide.recommend(body)


@router.get("/release/distributors", response_model=list[DistributorProfile], summary="유통사 프로파일 (규격·기간·비용·출처)")
def list_distributors() -> list[DistributorProfile]:
    return list(distributors.PROFILES.values())


@router.get("/release/rights-questions", response_model=list[RightsQuestion], summary="권리 자가진단 질문")
def rights_questions() -> list[RightsQuestion]:
    return rights.QUESTIONS


# ---- 작업별 ----

def _info_view(jf: JobFiles) -> ReleaseInfoView:
    info, saved = release_info.load(jf)
    return ReleaseInfoView(info=info, saved=saved, checks=release_info.checks(info),
                           suggestions=release_info.suggestions(info))


@router.get("/jobs/{job_id}/release-info", response_model=ReleaseInfoView,
            summary="발매 정보 (저장 전이면 업로드 정보로 채운 초안) + 표기 검사 + 자동 교정 제안")
def get_release_info(jf: JobFiles = Depends(job_files)) -> ReleaseInfoView:
    return _info_view(jf)


@router.put("/jobs/{job_id}/release-info", response_model=ReleaseInfoView,
            summary="발매 정보 저장 (전체를 한 번에) → 검사 결과",
            description="저장하면 곡 정보(제목·아티스트·장르·발매일·가사)도 같이 바뀌어 발매 캘린더·제출 전 검수·커뮤니티에 반영된다. "
                        "suggestions의 fields를 info에 덮어써서 다시 PUT하면 자동 교정이 적용된다.")
def put_release_info(body: ReleaseInfo, jf: JobFiles = Depends(job_files)) -> ReleaseInfoView:
    release_info.save(jf, body)
    return _info_view(jf)


@router.get("/jobs/{job_id}/rights", response_model=RightsResult, summary="권리 자가진단 결과")
def get_rights(jf: JobFiles = Depends(job_files)) -> RightsResult:
    return rights.evaluate(rights.load(jf))


@router.put("/jobs/{job_id}/rights", response_model=RightsResult, summary="권리 자가진단 답 저장 {질문 id: 값}",
            description="질문과 값은 GET /release/rights-questions. 일부만 보내도 되고(complete=false), 모르는 값은 버린다.")
def put_rights(body: dict[str, str], jf: JobFiles = Depends(job_files)) -> RightsResult:
    return rights.evaluate(rights.save(jf, body))


def sheet_files(info) -> dict[str, str]:
    base = f"{info.artist} - {info.title}".strip(" -") or "track"
    return {"audio": f"{base}.wav (처음 올린 마스터 WAV)", "cover": f"{base}_cover_3000.jpg (ZIP의 release 폴더)"}


def distributor_check(jf: JobFiles, dist_id: str, s: Settings) -> DistributorCheck:
    info, _ = release_info.load(jf)
    items = distributors.evaluate(dist_id, info, distributors.job_context(jf))
    counts = {k: sum(1 for i in items if i.status == k) for k in ("ok", "warn", "fail", "todo")}
    token = make_token(s.download_token_secret, jf.job_id, f"sheet/{dist_id}", s.download_token_ttl_sec)
    return DistributorCheck(distributor=distributors.PROFILES[dist_id], items=items, counts=counts,
                            sheet_url=f"/jobs/{jf.job_id}/distributors/{dist_id}/sheet.csv?t={token}")


@router.get("/jobs/{job_id}/distributors/{dist_id}", response_model=DistributorCheck,
            summary="이 유통사 기준 판정 (등록 시점·파일·크레딧·AI 정책·비용) + 제출 준비표 링크")
def get_distributor_check(dist_id: str, jf: JobFiles = Depends(job_files),
                          s: Settings = Depends(settings)) -> DistributorCheck:
    return distributor_check(jf, _dist(dist_id), s)


@router.get("/jobs/{job_id}/distributors/{dist_id}/sheet.csv", summary="제출 준비표 CSV (서명 링크 t, 24시간)",
            response_class=Response)
def sheet(job_id: str, dist_id: str, t: str = Query(), s: Settings = Depends(settings)) -> Response:
    jf = find_job(job_id)
    if read_token(s.download_token_secret, t) != (jf.job_id, f"sheet/{_dist(dist_id)}"):
        raise AppError("LINK_EXPIRED", "링크가 만료되었어요. 화면을 새로고침해 주세요.", False, http_status=403)
    info, _ = release_info.load(jf)
    name = f"{distributors.PROFILES[dist_id].name}_제출준비표.csv"
    return Response(distributors.sheet_csv(dist_id, info, sheet_files(info), distributors.job_context(jf)), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})
