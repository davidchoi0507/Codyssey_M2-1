"""유통사 프로파일 + 유통사별 판정 + 제출 준비표 (03 기획서 D).

규격은 플랫폼이 아니라 유통사가 정한다 (02 조사 정리 §1 핵심 4). 1단계는 국내 뮤즈플랫폼 + 해외 DistroKid (03 §3 A안,
팀 확정 전 — 바뀌면 PROFILES만 고친다). 값마다 출처가 다르다: [공식] 유통사 공식 안내 / [2차] 블로그·비교 자료 /
[확인 필요] 이번 조사로 확인 못 함.

2026-10-10 팀원 조사(docs/part2/유통사_입력항목_조사.pdf): 두 곳 모두 내려받는 제출 양식(엑셀·문서)이 없고 웹 화면에 직접
입력한다. 그래서 제출 준비표는 "웹 화면에 옮겨 적을 값"을 그 화면 순서대로 정리한 것이다.
- DistroKid: 공식 도움말에 업로드 화면 18개 구역·트랙 14개 항목·크레딧·가사 형식·AI 표기가 공개돼 그 순서 그대로.
- 뮤즈플랫폼: 입력 항목은 로그인 뒤 '앨범관리' 화면에만 있어 확인 못 함 → 공개된 범위(가사 칸, 요청사항 칸)와 일반 항목으로.
  로그인 뒤 첫 화면 '레이블 이름 설정'은 사용자가 캡처로 확인(docs/part2/IMG_4390.webp, 2026-10-10) → 준비표 맨 앞에 넣는다.
"""
import csv
import io
import re
from datetime import date

from app.pipeline.release import today_kst
from app.schemas.package import CheckItem
from app.schemas.release import DistributorProfile, ReleaseInfo

CHECKED_AT = "2026-10-10"
# 뮤즈플랫폼 로그인 뒤 첫 화면 (회원정보 > 레이블 이름 설정, 화면 캡처로 확인)
LABEL_SETUP = ("가입하고 로그인하면 먼저 '레이블 이름 설정'을 해요: 레이블(필수, 앨범 등록·정산에 쓰이고 한 번 정하면 바꿀 수 없음 — "
               "레이블이 여럿이면 계정을 따로 만들어야 함), 레이블(국내, 해외와 다르게 표시할 때만), 레이블 로고(선택, 1000×1000 이상 "
               "정사각 JPG/PNG), 레이블 소개(비트포트로 발매하면 영문), 이름·휴대전화(필수), 주소 [공식 화면].")
PROFILES: dict[str, DistributorProfile] = {
    "muzeplatform": DistributorProfile(
        id="muzeplatform", name="뮤즈플랫폼", kind="국내 · 셀프 등록형",
        signup="누구나 이메일로 가입 (심사 없음) [공식]",
        stores="국내 FLO·멜론·지니·벅스·VIBE 등 + 해외 Apple Music·Spotify·TikTok·YouTube·Deezer·Amazon 등 35곳 이상 [공식]",
        melon="가능 [공식]",
        lead_time="음원 등록 15일 후 발매(2주 내) [공식] — 여유 있게 3주 전 등록 권장",
        lead_days=15,
        cost="BASIC 등록비 무료 + 수수료 20% / STANDARD 70,000원(2곡째부터 곡당 5,000원, 부가세 별도) + 수수료 15% [공식]",
        audio="공식 규격 문서를 확인하지 못함 [확인 필요] — 무손실 WAV(44.1kHz/16bit 이상)로 준비하면 안전해요",
        cover="공식 규격 문서를 확인하지 못함 [확인 필요] — 3000×3000 정사각 JPG(RGB)로 준비하면 안전해요",
        ai_policy="공식 안내를 확인하지 못함 [확인 필요]",
        extras="등록 5단계: 회원가입 → 전자계약서 동의 → 앨범/트랙 정보 등록 → 발매 요청 → 결제 [공식]. "
               f"{LABEL_SETUP} "
               "입력은 로그인 뒤 '앨범관리' 화면(가사 칸·요청사항 칸 있음) — 전체 항목은 공개 자료로 확인 못 함. "
               "방송심의 대행(11개 방송사, 165,000원) 등 부가 서비스. 정산: 발매 2개월 뒤부터 월별 리포트, 누적 5만 원 이상 지급 [공식]. "
               "문의: muzeplatform@gmail.com, 카카오톡 채널, 070-8845-6242(10~19시)",
        caution="전자계약서 내용·ISRC 발급 방식·파일 규격은 공개 자료에 없어요. 가입 후 화면이나 문의로 확인하세요. "
                "Spotify·YouTube에도 보내므로 DistroKid와 같이 쓰면 같은 플랫폼에 중복 전달될 수 있어요.",
        sources=["https://www.muzeplatform.com/", "https://www.muzeplatform.com/terms"], checked_at=CHECKED_AT),
    "distrokid": DistributorProfile(
        id="distrokid", name="DistroKid", kind="해외 · 셀프 등록형 (연 구독)",
        signup="누구나 가입 [공식]",
        stores="Spotify·Apple Music·YouTube Music·TikTok 등 [공식]",
        melon="공식 스토어 목록에 멜론 없음 — 국내 발매는 국내 유통사를 따로 써야 해요",
        lead_time="스토어마다 수일(Spotify 2~5일, YouTube Music 1~3일), 모두 반영까지 최대 약 2주. 발매 약 4주 전 업로드 권장 [공식]",
        lead_days=28,
        cost="연 $24.99부터 (2026 인상, 2차 자료 — 공식 가격 페이지에서 확인). 발매일 지정·레이블 이름은 Musician Plus 이상. "
             "구독을 끊으면 음원이 내려가요 [공식]",
        audio="WAV 권장(FLAC도 가능), 보통 16bit/44.1kHz, 1GB 이하 [공식]",
        cover="1:1 정사각, 3000×3000 JPG가 가장 알맞음(최소 1000×1000), RGB. URL·QR·가격·SNS 로고·흐린 이미지·사용권 없는 사진 금지 [공식]",
        ai_policy="업로드할 때 AI 생성 여부를 묻고, '예'면 가사·작곡·전체 음원·일부 음원 중 골라요. 도구로만 썼으면 해당 없음 [공식]",
        extras="ISRC·UPC 무료 발급 [공식]. 크레딧은 distrokid.com/credits, 가사는 distrokid.com/lyrics 에서 업로드 뒤 입력. "
               "YouTube Content ID는 유료 부가 서비스.",
        caution="작곡가 실명 필수, Apple Music으로 보내면 연주자 크레딧 1개 이상 + 프로듀서 크레딧 필요, 가사는 형식 요건을 "
                "통과해야 전달(약 1~2주) [공식].",
        sources=["https://support.distrokid.com/hc/en-us/articles/4407879306643",
                 "https://support.distrokid.com/hc/en-us/articles/39974262480019",
                 "https://support.distrokid.com/hc/en-us/articles/360050506673",
                 "https://support.distrokid.com/hc/en-us/articles/50784235803411",
                 "https://distrokid.com/pricing/", "https://support.distrokid.com/hc/en-us/articles/360013649093"],
        checked_at=CHECKED_AT),
}


def job_context(jf) -> dict:
    """유통사 판정·준비표에 쓰는 작업 정보: 음원 형식·길이, 고른 커버 크기, 권리 답, 하이라이트 시작."""
    from PIL import Image

    from app.pipeline import rights
    from app.pipeline.release import _probe_audio
    from app.pipeline.render import cover_file_or_none
    cover_px = None
    if jf.selected_cover.exists():
        sel = jf.read_json(jf.selected_cover)
        p = cover_file_or_none(jf, sel["item_id"], sel["v"])
        if p is not None:
            with Image.open(p) as im:
                cover_px = min(im.size)
    hl = None
    v = jf.read_json(jf.accepted)["version"] if jf.accepted.exists() else jf.latest_note_version()
    if v:
        hl = float(jf.read_json(jf.note(v))["highlight"]["selected"]["start"])
    duration = float(jf.read_json(jf.features)["duration_sec"]) if jf.features.exists() else None
    return {"audio": _probe_audio(jf), "cover_px": cover_px, "rights": rights.load(jf), "highlight_start": hl,
            "duration": duration}


# ---- DistroKid 가사 형식 요건 (공식 도움말 "lyrics formatting") ----

_SECTION = re.compile(r"^\s*[\[(]?\s*(intro|verse|chorus|pre-?chorus|bridge|outro|hook|refrain|인트로|벌스|후렴|브릿지|아웃트로|훅|1절|2절)"
                      r"\s*\d*\s*[\])]?\s*:?\s*$", re.I)
_REPEAT_MARK = re.compile(r"(\b[x×]\s*\d\b|\b\d\s*[x×]\b|반복)", re.I)
_LINK = re.compile(r"(https?://|www\.|@[a-z0-9_.]{3,})", re.I)


def lyrics_problems(lyrics: str) -> list[str]:
    """DistroKid 가사 형식 요건에 걸릴 만한 것 (한국어 줄에는 대문자 규칙이 해당 없음)."""
    lines = lyrics.splitlines()
    out = []
    if any(_SECTION.match(ln) for ln in lines):
        out.append("Intro·Chorus·후렴 같은 섹션 표시는 빼요")
    if any(_REPEAT_MARK.search(ln) for ln in lines):
        out.append("'Chorus 2x'·'반복' 같은 줄임 대신 반복 구절을 모두 적어요")
    if any(_LINK.search(ln) for ln in lines):
        out.append("SNS 링크·아이디는 넣지 않아요")
    if any(ln != ln.strip() for ln in lines if ln.strip()):
        out.append("줄 앞뒤 빈칸을 지워요")
    if any(ln.rstrip()[-1:] in ".,;:" for ln in lines if ln.strip()):
        out.append("줄 끝 문장부호(. , ; :)는 빼요 (! ?는 괜찮아요)")
    if re.search(r"\n\s*\n\s*\n", lyrics):
        out.append("빈 줄은 섹션 사이에 한 줄만")
    latin = [ln.strip() for ln in lines if re.match(r"^\s*[A-Za-z]", ln)]
    if latin and any(ln[0].islower() for ln in latin):
        out.append("영어 줄은 첫 글자를 대문자로")
    return out


def evaluate(dist_id: str, info: ReleaseInfo, ctx: dict, today: date | None = None) -> list[CheckItem]:
    """이 유통사 기준으로 다시 본 항목 (group=dist). 공통 검사(곡 정보·음원·커버)는 제출 전 검수에 있다."""
    p = PROFILES[dist_id]
    today = today or today_kst()
    audio, cover_px, rights = ctx.get("audio"), ctx.get("cover_px"), ctx.get("rights") or {}
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
    composers = [c for c in info.credits if c.role == "작곡"]
    if dist_id == "distrokid":
        add("melon", "멜론 등 국내", "warn", p.melon)
        # 업로드 화면 Track 구역 (공식 도움말)
        st = rights.get("song_type")
        add("songwriter", "Songwriter (자작곡/커버)", "ok" if st == "original" else "fail" if st in ("cover", "remix") else "todo",
            "자작곡으로 표시해요." if st == "original"
            else "커버곡이면 원곡 아티스트·곡 제목을 적고 커버 라이선스를 받아야 해요 (권리 자가진단 참고)." if st in ("cover", "remix")
            else "권리 자가진단에서 곡 종류를 골라 주세요.")
        no_legal = not composers or any(not c.legal_name.strip() for c in composers)
        add("composer", "Songwriter real name", "fail" if no_legal else "ok",
            "자작곡이면 작곡가 실명을 반드시 적어요 (발매 정보의 크레딧)." if no_legal
            else f"{', '.join(c.legal_name for c in composers)} — 실명이 있어요.")
        roles = {c.role for c in info.credits}
        apple_ok = "프로듀서" in roles and bool(roles & {"보컬", "연주"})
        add("apple", "Apple Music 추가 요건", "ok" if apple_ok else "warn",
            "연주자(보컬·연주) 크레딧과 프로듀서 크레딧이 있어요." if apple_ok
            else "Apple Music·iTunes로 보내려면 연주자 크레딧 1개 이상(보컬·연주)과 프로듀서 크레딧이 필요해요. "
                 "발매 정보의 크레딧에 넣어 주세요 (혼자 만들었으면 본인 이름으로).")
        if info.language != "instrumental" and info.lyrics.strip():
            probs = lyrics_problems(info.lyrics)
            add("lyrics_format", "가사 형식", "warn" if probs else "ok",
                " / ".join(probs) + " — 형식 요건을 통과해야 서비스로 전달돼요 (약 1~2주)." if probs
                else "형식 요건에 걸릴 만한 곳이 없어요. distrokid.com/lyrics 에 붙여 넣어요.")
        if (d := ctx.get("duration")) and ctx.get("highlight_start") is not None and d > 76:
            hs = ctx["highlight_start"]
            add("preview", "Preview clip start time", "ok",
                f"{int(hs // 60)}:{int(hs % 60):02d} — AI 노트의 하이라이트 시작이에요. 미리듣기 시작 지점으로 쓰면 좋아요.")
    # 가사 (국내)
    if dist_id == "muzeplatform" and info.language != "instrumental":
        add("lyrics", "가사", "ok" if info.lyrics.strip() else "warn",
            "가사 텍스트가 있어요. 앨범관리 화면의 가사 칸에 붙여 넣어요." if info.lyrics.strip()
            else "앨범관리 화면에 가사 칸이 있어요. 가사를 넣어 주세요.")
    if dist_id == "muzeplatform":
        add("label", "레이블 이름 (처음 한 번)", "todo",
            "로그인하면 첫 화면에서 레이블 이름을 정해요. 한 번 정하면 바꿀 수 없고 모든 앨범·정산에 쓰여요. "
            "따로 레이블이 없으면 아티스트명이나 앞으로 계속 쓸 1인 레이블 이름으로 정하세요"
            f"{f' (예: {info.artist})' if info.artist.strip() else ''}. 이름·휴대전화도 필수예요.")
    # AI
    ai = rights.get("ai_audio")
    if ai == "generated":
        add("ai", "AI 표기", "warn", p.ai_policy)
    elif ai in ("none", "tool") and dist_id == "distrokid":
        add("ai", "AI 표기", "ok", "AI 표기 대상이 아니에요 (도구로만 쓴 음정 보정·믹싱·마스터링은 해당 없음) [공식].")
    # 비용·부가
    add("cost", "비용", "todo", p.cost)
    if p.extras:
        add("extras", "알아 둘 것", "todo", p.extras)
    return items


def _names(info: ReleaseInfo, role: str, legal: bool) -> str:
    return ", ".join((c.legal_name if legal else c.stage_name or c.legal_name) for c in info.credits if c.role == role)


def _rows_distrokid(info: ReleaseInfo, files: dict[str, str], ctx: dict) -> list[tuple]:
    """DistroKid 업로드 화면 순서 그대로 (공식 도움말 'Upload Form: The Sections', 'Entering Track Information')."""
    rights = ctx.get("rights") or {}
    lang = {"ko": "Korean", "en": "English", "ja": "Japanese"}.get(info.language, "(연주곡 — 제목 언어로)")
    st = rights.get("song_type")
    hs = ctx.get("highlight_start")
    preview = f"{int(hs // 60)}:{int(hs % 60):02d}" if hs is not None and (ctx.get("duration") or 0) > 76 else ""
    ai = {"generated": "예 — The lyrics / The music / All of the audio / Part of the audio 중 해당 항목",
          "tool": "아니요 (도구로만 사용)", "none": "아니요"}.get(rights.get("ai_audio"), "")
    performers = "; ".join(f"{c.role}: {c.stage_name or c.legal_name}" for c in info.credits if c.role in ("보컬", "연주"))
    return [
        ("업로드 화면", "1 Services", "Spotify·Apple Music·YouTube Music 등 해외 서비스", "국내 사이트를 다른 유통사로 낸다면 겹치지 않게"),
        ("업로드 화면", "2 Number of songs", "1 (싱글)", ""),
        ("업로드 화면", "3 Previously Released?", "예 — 원래 발매일 입력" if rights.get("released_before") == "yes" else "아니요", ""),
        ("업로드 화면", "4 Artist/band name", info.artist, "모든 트랙에 표시. 기존 발매와 같은 철자"),
        ("업로드 화면", "5 Artist already in Spotify/Apple/YouTube…", info.previous_release or "처음이면 없음", "기존 프로필이 있으면 표시"),
        ("업로드 화면", "6 Release date", info.release_date or "", "미래 날짜 지정은 Musician Plus 이상. 발매 시각(Spotify)도 이때"),
        ("업로드 화면", "7 Record label", "", "Musician Plus·Ultimate만 — 없으면 비움"),
        ("업로드 화면", "8 Album cover", files.get("cover", ""), "3000x3000 JPG가 가장 알맞음"),
        ("업로드 화면", "9 Album title", info.album or info.title, "싱글은 곡 제목이 기본값"),
        ("업로드 화면", "11 Language", lang, "트랙 제목에 쓴 언어와 같게"),
        ("업로드 화면", "12 Primary genre", info.genre_primary, "목록에서 가장 가까운 것"),
        ("업로드 화면", "13 Secondary genre", info.genre_secondary, "선택"),
        ("트랙 1", "Song title", info.title, "버전·추가 아티스트 이름은 넣지 않음"),
        ("트랙 1", "Add featured artist", ", ".join(info.featuring), "역할: Featured artist"),
        ("트랙 1", "Add version info", info.version, "Live·Acoustic·Radio Edit·Remix 등, 없으면 비움"),
        ("트랙 1", "Audio file", files.get("audio", ""), ""),
        ("트랙 1", "Songwriter", {"original": "자작곡", "cover": "커버곡", "remix": "커버곡(리믹스) — 권리 확인"}.get(st, ""), ""),
        ("트랙 1", "Songwriter(s) real name", _names(info, "작곡", True), "자작곡이면 필수"),
        ("트랙 1", "Explicit lyrics", "" if info.explicit is None else ("예" if info.explicit else "아니요"), ""),
        ("트랙 1", "Instrumental?", "예" if info.language == "instrumental" else "아니요 (가사 있음)", ""),
        ("트랙 1", "Preview clip start time", preview, "선택 — 1분 16초보다 긴 곡만. AI 노트의 하이라이트 시작"),
        ("트랙 1", "AI 생성 부분", ai, "업로드할 때 물어봄. 나중에 credits에서 수정 가능"),
        ("업로드 화면", "15 Artist Mapping", info.previous_release, "피처링이 있을 때만 — Spotify URI·Apple·YouTube Music URL"),
        ("업로드 화면", "16 Apple Music 추가 요건",
         f"연주자: {performers or '(없음)'} / 프로듀서: {_names(info, '프로듀서', False) or '(없음)'}",
         "Apple Music·iTunes로 보낼 때 연주자 1명 이상 + 프로듀서 필요"),
        ("업로드 화면", "18 Important checkboxes", "", "필수 — 화면에서 직접 확인·체크"),
        ("업로드 뒤 (distrokid.com/credits)", "Songwriter", _names(info, "작곡", False) or _names(info, "작곡", True), "다른 크레딧보다 먼저"),
        ("업로드 뒤 (distrokid.com/credits)", "Producer", _names(info, "프로듀서", False), ""),
        ("업로드 뒤 (distrokid.com/credits)", "Musician", performers, "악기 선택"),
        ("업로드 뒤 (distrokid.com/lyrics)", "Lyrics", info.lyrics, "섹션 표시·줄임 반복·줄 끝 문장부호 없이. 반영 약 1~2주"),
        ("참고", "유통사", "DistroKid", f"제출 양식 파일은 없고 웹 화면에 직접 입력. 조사 기준일 {CHECKED_AT}"),
    ]


def _rows_generic(dist_id: str, info: ReleaseInfo, files: dict[str, str]) -> list[tuple]:
    """입력 항목이 공개되지 않은 유통사 (뮤즈플랫폼): 일반적인 항목 순서."""
    p = PROFILES[dist_id]
    lang = {"ko": "한국어", "en": "영어", "ja": "일본어", "instrumental": "연주곡(가사 없음)"}.get(info.language, info.language)
    first = "가입 후 첫 화면 (레이블 이름 설정)"
    label_rows = [
        (first, "레이블 *", info.artist, "한 번 정하면 바꿀 수 없음. 앨범 등록·정산에 쓰임. 레이블이 없으면 아티스트명이나 계속 쓸 1인 레이블 이름"),
        (first, "레이블(국내)", "", "국내 발매용 레이블명을 해외와 다르게 표시할 때만 — 같으면 비움"),
        (first, "레이블 로고", "", "선택 — 1000×1000 이상 정사각 JPG 또는 PNG"),
        (first, "레이블 소개", "", "선택 — 비트포트로 발매하려면 영문으로"),
        (first, "이름 *", "", "계정 주인(정산 받을 사람) 이름"),
        (first, "전화 *", "", "휴대전화 번호 (없으면 유선)"),
        (first, "주소", "", "선택"),
    ] if dist_id == "muzeplatform" else []
    return label_rows + [
        ("앨범", "앨범명", info.album or info.title, "싱글이면 곡 제목과 같게"),
        ("앨범", "앨범 아티스트", info.artist, "기존 발매와 같은 철자"),
        ("앨범", "발매일", info.release_date or "", p.lead_time),
        ("앨범", "발매 시각", info.release_time, "국내는 18:00 발매가 흔함"),
        ("앨범", "1차 장르", info.genre_primary, "목록에서 가장 가까운 것"),
        ("앨범", "2차 장르", info.genre_secondary, ""),
        ("앨범", "© 저작권자", info.copyright_holder, "작사·작곡 권리자"),
        ("앨범", "℗ 음원 권리자", info.recording_holder, "녹음 권리자"),
        ("트랙 1", "곡 제목", info.title, "피처링·버전·Explicit은 넣지 않음"),
        ("트랙 1", "버전", info.version, "없으면 비움"),
        ("트랙 1", "메인 아티스트", info.artist, ""),
        ("트랙 1", "피처링 아티스트", ", ".join(info.featuring), ""),
        ("트랙 1", "19금(Explicit)", "" if info.explicit is None else ("예" if info.explicit else "아니요"), ""),
        ("트랙 1", "언어", lang, ""),
        ("트랙 1", "작사 (실명 / 활동명)", f"{_names(info, '작사', True)} / {_names(info, '작사', False)}", ""),
        ("트랙 1", "작곡 (실명 / 활동명)", f"{_names(info, '작곡', True)} / {_names(info, '작곡', False)}", ""),
        ("트랙 1", "편곡", _names(info, "편곡", False), ""),
        ("트랙 1", "그 밖의 크레딧", "; ".join(f"{c.role}: {c.stage_name or c.legal_name}" for c in info.credits
                                         if c.role not in ("작사", "작곡", "편곡")), ""),
        ("트랙 1", "ISRC", info.isrc, "없으면 비움 — 발급 방식은 공개 자료에 없음"),
        ("트랙 1", "가사", info.lyrics, "앨범관리 화면의 가사 칸"),
        ("파일", "음원", files.get("audio", ""), p.audio),
        ("파일", "커버", files.get("cover", ""), p.cover),
        ("요청사항 칸", "요청사항", "", "앨범관리 화면에 요청사항 칸이 있음 — 발매 시각·표기 요청 등"),
        ("참고", "유통사", p.name, "레이블 설정은 로그인 뒤 첫 화면 그대로. 앨범 입력 항목 전체는 확인 못 해 일반 항목 순서로 정리. "
                                 f"제출 양식 파일 없이 웹 화면에 직접 입력. 조사 기준일 {CHECKED_AT}"),
    ]


def sheet_csv(dist_id: str, info: ReleaseInfo, files: dict[str, str], ctx: dict | None = None) -> bytes:
    """제출 준비표 — 유통사 웹 화면에 옮겨 적을 값 (두 곳 모두 내려받는 제출 양식이 없음). 엑셀에서 한글이 안 깨지게 UTF-8 BOM."""
    ctx = ctx or {}
    rows = _rows_distrokid(info, files, ctx) if dist_id == "distrokid" else _rows_generic(dist_id, info, files)
    buf = io.StringIO()
    csv.writer(buf).writerows([("구분", "화면 항목", "입력할 값", "메모"), *rows])
    return ("﻿" + buf.getvalue()).encode("utf-8")
