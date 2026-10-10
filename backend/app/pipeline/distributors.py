"""유통사 프로파일 + 유통사별 판정 + 제출 준비표 (03 기획서 D).

규격은 플랫폼이 아니라 유통사가 정한다 (02 조사 정리 §1 핵심 4). 1단계는 국내 뮤즈플랫폼 + 해외 DistroKid (03 §3 A안,
팀 확정 전 — 바뀌면 PROFILES만 고친다). 값마다 출처가 다르다: [공식] 유통사 공식 안내 / [2차] 블로그·비교 자료 /
[확인 필요] 이번 조사로 확인 못 함. 공식 제출 양식(엑셀)을 아직 못 구해서 제출 준비표는 "공개된 입력 항목 순서"로 만든다.
"""
import csv
import io
from datetime import date

from app.pipeline.release import today_kst
from app.schemas.package import CheckItem
from app.schemas.release import DistributorProfile, ReleaseInfo

CHECKED_AT = "2026-10-09"
PROFILES: dict[str, DistributorProfile] = {
    "muzeplatform": DistributorProfile(
        id="muzeplatform", name="뮤즈플랫폼", kind="국내 · 셀프 등록형",
        signup="누구나 이메일로 가입 (심사 없음) [공식]",
        stores="멜론·지니·FLO·벅스·VIBE + Spotify·Apple Music·YouTube 등 35곳 이상 [공식]",
        melon="가능 [공식]",
        lead_time="등록 후 15일(2주) 안에 발매 [공식] — 여유 있게 3주 전 등록 권장",
        lead_days=15,
        cost="BASIC 등록비 무료 + 수수료 20% / STANDARD 70,000원(2곡부터 곡당 5,000원 추가) + 수수료 15% [공식]",
        audio="공식 규격 문서를 확인하지 못함 [확인 필요] — 무손실 WAV(44.1kHz/16bit 이상)로 준비하면 안전해요",
        cover="공식 규격 문서를 확인하지 못함 [확인 필요] — 3000×3000 정사각 JPG(RGB)로 준비하면 안전해요",
        ai_policy="공식 안내를 확인하지 못함 [확인 필요]",
        extras="방송심의 대행(11개 방송사, 165,000원), AI 커버아트, 가사영상 등 부가 서비스 [공식]. "
               "정산: 발매 2개월 뒤부터 월별 리포트, 누적 5만 원 이상 지급 [공식]",
        caution="이용약관(권리 귀속·해지·삭제)은 직접 확인하세요.",
        sources=["https://www.muzeplatform.com"], checked_at=CHECKED_AT),
    "distrokid": DistributorProfile(
        id="distrokid", name="DistroKid", kind="해외 · 셀프 등록형 (연 구독)",
        signup="누구나 가입 [공식]",
        stores="Spotify·Apple Music·YouTube Music·TikTok 등 [공식]",
        melon="공식 스토어 목록에 멜론 없음 — 국내 발매는 국내 유통사를 따로 써야 해요",
        lead_time="스토어마다 수일(Spotify 2~5일, YouTube Music 1~3일), 모두 반영까지 최대 약 2주. 발매 약 4주 전 업로드 권장 [공식]",
        lead_days=28,
        cost="연 $24.99부터 (2026 인상, 2차 자료 — 공식 가격 페이지에서 확인). 발매일 지정은 Musician Plus 이상. "
             "구독을 끊으면 음원이 내려가요 [공식]",
        audio="WAV 권장(FLAC도 가능), 보통 16bit/44.1kHz, 1GB 이하 [공식]",
        cover="1:1 정사각, 3000×3000 권장(최소 1000×1000), JPG·RGB. URL·QR·가격·SNS 로고·흐린 이미지·사용권 없는 사진 금지 [공식]",
        ai_policy="AI가 일부라도 만든 트랙은 AI 크레딧을 넣어야 해요 (도구로만 썼으면 불필요) [공식]",
        extras="ISRC·UPC 무료 발급 [공식]. YouTube Content ID는 유료 부가 서비스.",
        caution="작곡가 실명 필수 [공식].",
        sources=["https://distrokid.com/pricing/", "https://support.distrokid.com/hc/en-us/articles/360013647753",
                 "https://support.distrokid.com/hc/en-us/articles/360013534334",
                 "https://support.distrokid.com/hc/en-us/articles/360013649093"], checked_at=CHECKED_AT),
}


def evaluate(dist_id: str, info: ReleaseInfo, audio: dict | None, cover_px: int | None, rights: dict[str, str],
             today: date | None = None) -> list[CheckItem]:
    """이 유통사 기준으로 다시 본 항목 (group=dist). 공통 검사(곡 정보·음원·커버)는 제출 전 검수에 있다."""
    p = PROFILES[dist_id]
    today = today or today_kst()
    items: list[CheckItem] = []

    def add(id_, label, status, detail):
        items.append(CheckItem(group="dist", id=id_, label=label, status=status, detail=detail))

    # 일정
    if info.release_date:
        left = (date.fromisoformat(info.release_date) - today).days
        add("lead", "등록 시점", "ok" if left >= p.lead_days else "warn" if left >= 7 else "fail",
            f"발매까지 {left}일 — {p.lead_time}" if left >= 0 else "발매일이 지났어요. 새 발매일을 정하세요.")
    else:
        add("lead", "등록 시점", "todo", f"발매일을 정하면 계산해요. {p.lead_time}")
    # 음원 형식
    if audio is None:
        add("audio", "음원 파일", "todo", p.audio)
    elif audio.get("ext") == ".mp3":
        add("audio", "음원 파일", "fail", f"mp3로 올렸어요. {p.audio}")
    else:
        ok = audio.get("sample_rate", 0) >= 44100 and audio.get("bits", 16) in (0, 16, 24, 32)
        add("audio", "음원 파일", "ok" if ok else "warn", f"{audio.get('sample_rate', 0) / 1000:g}kHz"
            f"{' / ' + str(audio['bits']) + 'bit' if audio.get('bits') else ''} 무손실 — {p.audio}")
    # 커버
    if cover_px is None:
        add("cover", "커버", "todo", p.cover)
    else:
        add("cover", "커버", "ok" if cover_px >= 3000 else "warn", f"{cover_px}px — {p.cover}")
    # 국내 스토어
    if dist_id == "distrokid":
        add("melon", "멜론 등 국내", "warn", p.melon)
    # 크레딧 실명
    no_legal = [c.role for c in info.credits if c.role == "작곡" and not c.legal_name.strip()]
    if dist_id == "distrokid":
        add("composer", "작곡가 실명", "fail" if no_legal or not any(c.role == "작곡" for c in info.credits) else "ok",
            "작곡가 실명을 넣어 주세요 (필수)." if no_legal or not any(c.role == "작곡" for c in info.credits)
            else "작곡가 실명이 있어요.")
    # 가사 (국내)
    if dist_id == "muzeplatform" and info.language != "instrumental":
        add("lyrics", "가사", "ok" if info.lyrics.strip() else "warn",
            "가사 텍스트가 있어요." if info.lyrics.strip() else "국내 플랫폼은 가사 텍스트를 받는 경우가 많아요. 가사를 넣어 주세요.")
    # AI
    if rights.get("ai_audio") == "generated":
        add("ai", "AI 음원", "warn", p.ai_policy)
    # 비용·부가
    add("cost", "비용", "todo", p.cost)
    if p.extras:
        add("extras", "알아 둘 것", "todo", p.extras)
    return items


def sheet_csv(dist_id: str, info: ReleaseInfo, files: dict[str, str]) -> bytes:
    """제출 준비표 — 유통사 입력 화면에 옮겨 적을 값. 엑셀에서 한글이 깨지지 않게 UTF-8 BOM."""
    p = PROFILES[dist_id]
    credits = {role: [c for c in info.credits if c.role == role] for role in ("작사", "작곡", "편곡")}

    def names(role: str, legal: bool) -> str:
        return ", ".join((c.legal_name if legal else c.stage_name or c.legal_name) for c in credits[role]) or ""

    lang = {"ko": "한국어", "en": "영어", "ja": "일본어", "instrumental": "연주곡(가사 없음)"}.get(info.language, info.language)
    rows = [
        ("구분", "항목", "입력할 값", "메모"),
        ("앨범", "앨범명", info.album or info.title, "싱글이면 곡 제목과 같게"),
        ("앨범", "앨범 아티스트", info.artist, "기존 발매와 같은 철자"),
        ("앨범", "발매일", info.release_date or "", f"{p.lead_time}"),
        ("앨범", "발매 시각", info.release_time, "국내는 18:00 발매가 흔함"),
        ("앨범", "1차 장르", info.genre_primary, "유통사 목록에서 가장 가까운 것"),
        ("앨범", "2차 장르", info.genre_secondary, ""),
        ("앨범", "© 저작권자", info.copyright_holder, "작사·작곡 권리자"),
        ("앨범", "℗ 음원 권리자", info.recording_holder, "녹음 권리자"),
        ("트랙 1", "곡 제목", info.title, "피처링·버전·Explicit은 넣지 않음"),
        ("트랙 1", "버전", info.version, "없으면 비움"),
        ("트랙 1", "메인 아티스트", info.artist, ""),
        ("트랙 1", "피처링 아티스트", ", ".join(info.featuring), "피처링 칸에 따로"),
        ("트랙 1", "19금(Explicit)", "" if info.explicit is None else ("예" if info.explicit else "아니요"), ""),
        ("트랙 1", "언어", lang, ""),
        ("트랙 1", "작사 (실명)", names("작사", True), ""),
        ("트랙 1", "작사 (활동명)", names("작사", False), ""),
        ("트랙 1", "작곡 (실명)", names("작곡", True), "실명 필수인 곳이 많음"),
        ("트랙 1", "작곡 (활동명)", names("작곡", False), ""),
        ("트랙 1", "편곡", names("편곡", False), ""),
        ("트랙 1", "그 밖의 크레딧", "; ".join(f"{c.role}: {c.stage_name or c.legal_name}" for c in info.credits
                                         if c.role not in ("작사", "작곡", "편곡")), ""),
        ("트랙 1", "ISRC", info.isrc, "없으면 비움 — 유통사가 발급"),
        ("트랙 1", "가사", info.lyrics, "복사 가능한 텍스트"),
        ("파일", "음원", files.get("audio", ""), p.audio),
        ("파일", "커버", files.get("cover", ""), p.cover),
        ("참고", "이전 발매 링크", info.previous_release, "같은 아티스트 페이지로 묶을 때"),
        ("참고", "유통사", f"{p.name} ({p.kind})", f"조사 기준일 {p.checked_at}. 최종 기준은 유통사 안내 확인"),
    ]
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return ("﻿" + buf.getvalue()).encode("utf-8")
