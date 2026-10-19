"""발매 정보 구조화 입력 (03 기획서 A): 제목·아티스트·피처링·버전·Explicit·크레딧·가사를 칸별로 받고 표기를 검사한다.

근거 (02 조사 정리 §3.3): Spotify Metadata Style Guide — 피처링·Explicit·버전은 제목이 아니라 별도 항목, 아티스트 철자는
모든 발매에서 같게, 전부 대문자 금지 / DistroKid — 작곡가 실명 필수 / 포노 — 가사는 복사 가능한 텍스트.
"반려 위험을 줄이는" 점검이지 통과 보장이 아니다.
"""
import re
from datetime import date

from app.pipeline.jobfiles import JobFiles
from app.pipeline.release import _name_problems, today_kst
from app.schemas.package import CheckItem
from app.schemas.release import ReleaseInfo, Suggestion

FILE = "release_info.json"
_FEAT_IN_TITLE = re.compile(r"\s*[\(\[]?\s*(?:feat|ft|featuring)\.?\s+([^\)\]]+?)\s*[\)\]]?\s*$", re.I)
_FEAT_KO = re.compile(r"\s*[\(\[]?\s*(?:피처링|피쳐링)\s*[:.]?\s*([^\)\]]+?)\s*[\)\]]?\s*$")
_VERSION_IN_TITLE = re.compile(r"\s*[\(\[]\s*([^\)\]]*(?:ver\.?|version|버전|inst\.?|instrumental|remix|acoustic|live|"
                               r"remaster(?:ed)?|sped up|slowed)[^\)\]]*)\s*[\)\]]\s*$", re.I)
_EXPLICIT_IN_TITLE = re.compile(r"\s*[\(\[]?\s*(explicit|19금|clean)\s*[\)\]]?\s*", re.I)
_YEAR_IN_TITLE = re.compile(r"\s*[\(\[]\s*(19|20)\d{2}\s*[\)\]]\s*")
_HANGUL = re.compile(r"[가-힣]")


def path(jf: JobFiles):
    return jf.root / FILE


def load(jf: JobFiles) -> tuple[ReleaseInfo, bool]:
    """(정보, 저장했는지). 저장 전이면 업로드 때 곡 정보로 초안을 만든다."""
    p = path(jf)
    if p.exists():
        return ReleaseInfo(**jf.read_json(p)), True
    song = jf.read_json(jf.song)
    title = song.get("title", "")
    return ReleaseInfo(album=title, title=title, artist=song.get("artist", ""), genre_primary=song.get("genre") or "",
                       release_date=song.get("release_date"), lyrics=song.get("lyrics") or "",
                       language="ko" if _HANGUL.search(title + (song.get("lyrics") or "")) else "en",
                       copyright_holder=song.get("artist", ""), recording_holder=song.get("artist", "")), False


def save(jf: JobFiles, info: ReleaseInfo) -> None:
    jf.write_json(path(jf), info.model_dump())
    # 곡 정보(song.json)도 맞춰 둔다 — 발매 캘린더·패키지·커뮤니티가 이 값을 쓴다
    song = jf.read_json(jf.song)
    song.update({"title": info.title, "artist": info.artist, "genre": info.genre_primary or song.get("genre", ""),
                 "release_date": info.release_date, "lyrics": info.lyrics or song.get("lyrics")})
    jf.write_json(jf.song, song)
    jf.event("release_info_saved", credits=len(info.credits), featuring=len(info.featuring))


def suggestions(info: ReleaseInfo) -> list[Suggestion]:
    """제목에 섞인 피처링·버전·Explicit·연도를 제 칸으로 옮기는 제안."""
    out: list[Suggestion] = []
    title = info.title

    def with_album(fields: dict) -> dict:
        """싱글이라 앨범명이 제목과 같았으면 앨범명도 같이 고친다."""
        return fields | ({"album": fields["title"]} if "title" in fields and info.album.strip() == title.strip() else {})
    for rx in (_FEAT_IN_TITLE, _FEAT_KO):
        if m := rx.search(title):
            names = [n.strip() for n in re.split(r",|&| x | and ", m.group(1)) if n.strip()]
            out.append(Suggestion(id="feat", message=f"제목의 피처링 '{m.group(1).strip()}'을(를) 피처링 칸으로 옮겨요.",
                                  fields=with_album({"title": title[:m.start()].strip(),
                                                     "featuring": list(dict.fromkeys(info.featuring + names))})))
            return out  # 한 번에 하나씩 (옮긴 뒤 다시 검사)
    if m := _VERSION_IN_TITLE.search(title):
        out.append(Suggestion(id="version", message=f"제목의 '{m.group(1).strip()}'을(를) 버전 칸으로 옮겨요.",
                              fields=with_album({"title": title[:m.start()].strip(), "version": m.group(1).strip()})))
        return out
    if m := _EXPLICIT_IN_TITLE.search(title):
        explicit = m.group(1).lower() != "clean"
        out.append(Suggestion(id="explicit", message="제목의 Explicit·19금 표시는 빼고 19금 여부 칸으로 표시해요.",
                              fields=with_album({"title": _EXPLICIT_IN_TITLE.sub(" ", title).strip(), "explicit": explicit})))
        return out
    if _YEAR_IN_TITLE.search(title):
        out.append(Suggestion(id="year", message="제목의 연도 표시는 빼요 (발매일은 따로 넣어요).",
                              fields=with_album({"title": _YEAR_IN_TITLE.sub(" ", title).strip()})))
        return out
    if title and info.album != title and not info.album:
        out.append(Suggestion(id="album", message="싱글이면 앨범명을 곡 제목과 같게 써요.", fields={"album": title}))
    return out


def checks(info: ReleaseInfo, today: date | None = None) -> list[CheckItem]:
    today = today or today_kst()
    items: list[CheckItem] = []

    def add(id_, label, status, detail):
        items.append(CheckItem(group="meta", id=id_, label=label, status=status, detail=detail))

    # 제목·아티스트 표기
    for key, name in (("title", "곡 제목"), ("artist", "아티스트 이름")):
        value = getattr(info, key)
        if not value.strip():
            add(key, name, "fail", f"{name}을(를) 넣어 주세요.")
            continue
        probs = _name_problems(value)
        if key == "title" and (_FEAT_IN_TITLE.search(value) or _FEAT_KO.search(value)):
            probs = [p for p in probs if "피처링" not in p] + ["피처링은 제목이 아니라 피처링 칸에 따로 넣어요"]
        if key == "title" and (_VERSION_IN_TITLE.search(value) or _EXPLICIT_IN_TITLE.search(value)
                               or _YEAR_IN_TITLE.search(value)):
            probs.append("버전·Explicit·연도는 제목에 쓰지 않고 각 칸에 넣어요")
        tip = ("이전에 낸 곡이 있으면 그때와 똑같이 써야 같은 아티스트 페이지로 묶여요." if key == "artist"
               else "유통사 입력·커버 글자와 똑같아야 해요.")
        add(key, name, "warn" if probs else "ok", " / ".join(probs) if probs else f"'{value.strip()}' — {tip}")
    if info.artist and any(f.strip().lower() == info.artist.strip().lower() for f in info.featuring):
        add("featuring", "피처링", "fail", "메인 아티스트를 피처링에 또 넣지 않아요.")
    elif info.featuring:
        add("featuring", "피처링", "ok", f"{', '.join(info.featuring)} — 피처링 아티스트도 이전 발매와 같은 철자로.")
    album_probs = [p for p in _name_problems(info.album) if "피처링" not in p] if info.album.strip() else []
    if info.album and (_FEAT_IN_TITLE.search(info.album) or _FEAT_KO.search(info.album)
                       or _EXPLICIT_IN_TITLE.search(info.album)):
        album_probs.append("앨범명에도 피처링·Explicit을 쓰지 않아요")
    add("album", "앨범명", "warn" if album_probs or not info.album.strip() else "ok",
        " / ".join(album_probs) if album_probs
        else f"'{info.album.strip()}'" if info.album.strip() else "싱글도 앨범명이 필요해요. 보통 곡 제목과 같게 써요.")
    add("genre", "장르", "ok" if info.genre_primary else "warn",
        f"{info.genre_primary}{' / ' + info.genre_secondary if info.genre_secondary else ''} — 유통사 목록에서 가장 가까운 것을 골라요."
        if info.genre_primary else "1차 장르를 정해 주세요. 유통사 입력 화면의 목록에서 골라요.")
    add("explicit", "19금(Explicit)", "warn" if info.explicit is None else "ok",
        "가사에 욕설·선정적 표현이 있는지 정해 주세요. 빠뜨리면 반려·삭제될 수 있어요." if info.explicit is None
        else ("19금으로 표시해요 (제목에는 쓰지 않음)." if info.explicit else "19금 아님."))

    # 발매일
    if not info.release_date:
        add("release_date", "발매일", "warn", "발매일을 정해 주세요. 처음이면 오늘부터 5주 뒤 이후를 추천해요.")
    else:
        left = (date.fromisoformat(info.release_date) - today).days
        add("release_date", "발매일", "fail" if left < 0 else "warn" if left < 21 else "ok",
            f"{info.release_date} {info.release_time} — 지난 날짜는 유통사가 받지 않아요." if left < 0
            else f"{info.release_date} {info.release_time} (D-{left}) — 유통사 처리 기간이 빠듯해요. 고른 유통사 기준을 확인하세요."
            if left < 21 else f"{info.release_date} {info.release_time} (D-{left}).")

    # 크레딧
    roles = {c.role for c in info.credits}
    missing_legal = [c.role for c in info.credits if c.role in ("작사", "작곡") and not c.legal_name.strip()]
    need = {"작곡"} | (set() if info.language == "instrumental" else {"작사"})
    if not info.credits:
        add("credits", "크레딧", "fail", "작사·작곡·편곡자를 넣어 주세요. 작곡가는 실명이 필요해요.")
    elif need - roles:
        add("credits", "크레딧", "fail", f"{'·'.join(sorted(need - roles))} 크레딧이 빠졌어요.")
    elif missing_legal:
        add("credits", "크레딧", "fail", f"{'·'.join(dict.fromkeys(missing_legal))}의 실명이 비어 있어요. "
                                        "작곡가 실명은 유통사가 필수로 받아요 (플랫폼에는 활동명이 보여요).")
    else:
        add("credits", "크레딧", "ok" if "편곡" in roles else "warn",
            f"{len(info.credits)}명 — " + ("편곡자도 있으면 넣어 주세요 (국내 플랫폼 곡 정보에 보여요)." if "편곡" not in roles
                                          else "작사·작곡·편곡 모두 있어요."))
    add("holders", "©·℗ 권리자", "ok" if info.copyright_holder and info.recording_holder else "warn",
        f"© {info.copyright_holder} · ℗ {info.recording_holder}" if info.copyright_holder and info.recording_holder
        else "©(작사·작곡 권리자)와 ℗(녹음 권리자)를 넣어 주세요. 직접 만들고 녹음했으면 둘 다 본인 이름이에요.")

    # 가사
    if info.language == "instrumental":
        add("lyrics", "가사", "ok", "연주곡 — 가사 없음.")
    elif not info.lyrics.strip():
        add("lyrics", "가사", "warn", "가사를 텍스트로 넣어 주세요. 국내 유통사는 복사 가능한 가사를 요구하는 곳이 많아요.")
    else:
        lines = len([ln for ln in info.lyrics.splitlines() if ln.strip()])
        add("lyrics", "가사", "ok", f"{lines}줄 — 플랫폼에 그대로 보이니 오탈자를 한 번 더 확인하세요.")
    return items
