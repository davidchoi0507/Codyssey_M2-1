"""발매 준비: 발매 캘린더(발매일에서 거꾸로) + 유통사 제출 전 검수. AI를 쓰지 않는 규칙 계산이라 매번 새로 만든다.

국내 인디는 홍보가 1번 고민이고, 유통사 경유·플랫폼별 등록 기간·에디토리얼 피칭 마감을 몰라서 헤맨다 (2026-10-09 방향 논의).
기간은 유통사·플랫폼마다 달라서 "보통"·"권장"으로만 말하고, 확정 약속("통과 보장")은 하지 않는다.
"""
import json
import re
import subprocess
from datetime import date, datetime, timedelta

from PIL import Image

from app.analysis.audio_io import PROBE_TIMEOUT_SEC, input_args, run_ffmpeg
from app.pipeline.jobfiles import JobFiles
from app.pipeline.limits import KST
from app.schemas.package import CheckItem, ReleasePlan, ReleaseStep, SubmissionCheck

# (발매일 기준 일수, 제목, 설명, 관련 결과물 item_id)
_STEPS: list[tuple[int, str, str, list[str]]] = [
    (-35, "유통사에 음원·커버·정보 제출",
     "유통사 리드타임은 보통 7일~3주이고, 에디토리얼 피칭을 하려면 그보다 먼저 플랫폼에 음원이 넘어가 있어야 해요. "
     "제출 전 검수 목록을 모두 확인하고, '국내 음원 사이트 소개글'을 같이 내세요.", ["submission_check", "editorial"]),
    (-28, "Spotify 에디토리얼 피칭 제출",
     "유통사가 음원을 넘겨 Spotify for Artists에 '곧 발매'로 보이면 낼 수 있어요. 4~5주 전이 좋고, 늦어도 발매 7일 전까지 "
     "내야 팔로워의 Release Radar에 들어가요. 곡 설명(500자)과 태그는 에디토리얼 피칭에 있어요.", ["editorial"]),
    (-14, "숏폼 티저 1 — 하이라이트 15초",
     "릴스·틱톡에 하이라이트 숏폼을 올려 곡의 첫인상을 먼저 알려요. 틱톡 훅 문구를 영상 위에 쓰세요.",
     ["short", "copy-tiktok", "copy-instagram"]),
    (-10, "국내 매체·라디오·플레이리스트에 피칭 메일",
     "웹진·라디오 PD·플레이리스트 운영자에게 한국어 메일을 보내요. [대괄호] 자리는 직접 채우세요. 해외는 영어 메일(선택).",
     ["pitch-ko", "pitch-en"]),
    (-7, "발매 공지 + 커버 공개",
     "발매일과 커버를 공개해요. 채널별 이미지를 쓰고, 스레드·X에는 짧은 공지를.", ["copy-threads", "copy-x"]),
    (-3, "티저 2 — 반복 영상·다른 장면",
     "Spotify Canvas용 8초 반복 영상을 스토리에 올리거나, 연습·녹음 비하인드를 짧게 보여 줘요.", ["canvas"]),
    (0, "발매 — 채널 글 4종 게시",
     "인스타그램·틱톡(숏폼 본편)·스레드·X에 발매 글을 올리고, 프로필 링크를 음원 링크로 바꿔요. "
     "Spotify for Artists에 Canvas를 올려요.", ["copy-instagram", "copy-tiktok", "copy-threads", "copy-x", "canvas"]),
    (2, "반응 모아 다시 공유",
     "들어 준 사람들의 반응·플레이리스트 등록을 스토리로 다시 공유해요.", []),
    (7, "2주차 숏폼",
     "하이라이트와 다른 구간이나 곡을 만든 이야기로 숏폼을 한 번 더 올려요. 첫 주가 지나도 알리는 게 중요해요.", ["short"]),
]


def today_kst() -> date:
    return datetime.now(KST).date()


def release_plan(song: dict, today: date | None = None) -> ReleasePlan:
    today = today or today_kst()
    raw = song.get("release_date")
    rel = date.fromisoformat(raw) if raw else None
    steps = []
    for d, title, detail, items in _STEPS:
        day = rel + timedelta(days=d) if rel else None
        status = None if day is None else "past" if day < today else "today" if day == today else "upcoming"
        steps.append(ReleaseStep(d=d, label="D-day" if d == 0 else f"D{d:+d}", date=day.isoformat() if day else None,
                                 title=title, detail=detail, items=items, status=status))
    warnings = []
    if rel is None:
        warnings.append("발매일을 넣으면 날짜가 채워져요. 아직 정하지 않았다면 오늘부터 5주 뒤 이후로 잡는 걸 추천해요.")
    else:
        left = (rel - today).days
        if left < 0:
            warnings.append("발매일이 지난 날짜예요. 아직 발매 전이라면 유통사는 과거 날짜를 받지 않으니 새 발매일을 정하세요.")
        elif left < 7:
            warnings.append(f"발매까지 {left}일 — Spotify 에디토리얼 피칭은 발매 7일 전까지만 받아요. 이번 곡은 숏폼·채널 홍보에 집중하세요.")
        elif left < 21:
            warnings.append(f"발매까지 {left}일 — 유통사 리드타임(7일~3주) 안에 들어갈지 오늘 바로 유통사에 확인하세요.")
        elif left < 35:
            warnings.append(f"발매까지 {left}일 — 오늘 유통사에 제출하면 에디토리얼 피칭까지 낼 수 있어요.")
    return ReleasePlan(release_date=raw, today=today.isoformat(), steps=steps, warnings=warnings)


# ---- 제출 전 검수 ----

_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
_FEAT = re.compile(r"\b(feat|ft|featuring)\b\.?|피처링|피쳐링", re.I)
_EXTRA = re.compile(r"official|\bm/?v\b|음원|타이틀곡|뮤직비디오|공식|free download|new song|신곡", re.I)


def _name_problems(value: str) -> list[str]:
    out = []
    if value != value.strip() or "  " in value:
        out.append("앞뒤나 중간에 빈칸이 더 있어요")
    if _EMOJI.search(value):
        out.append("이모지는 대부분 유통사에서 반려돼요")
    if _EXTRA.search(value):
        out.append("'Official', '음원', '신곡' 같은 설명 단어는 빼야 해요")
    if _FEAT.search(value) and not re.search(r"\(Feat\. [^)]+\)", value):
        out.append("피처링은 '제목 (Feat. 아티스트)' 형식으로 써야 해요")
    letters = re.sub(r"[^A-Za-z]", "", value)
    if len(letters) >= 5 and letters.isupper():
        out.append("전부 대문자는 플랫폼이 고칠 수 있어요 (의도한 표기면 유통사에 미리 알리기)")
    return out


def _probe_audio(jf: JobFiles) -> dict | None:
    """원본 음원 형식 (패키지 조회마다 부르므로 한 번 읽고 analysis/audio_info.json에 둔다)."""
    cached = jf.root / "analysis" / "audio_info.json"
    src = jf.find_original()
    if cached.exists():
        info = jf.read_json(cached)
        if "true_peak" not in info and src is not None:  # 10/10 이전에 만든 기록 — 음량만 더 잰다
            info |= _loudness(src)
            jf.write_json(cached, info)
        return info
    if src is None:
        return None
    try:
        out = run_ffmpeg(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                          "stream=codec_name,sample_rate,bits_per_sample,bits_per_raw_sample,channels",
                          "-of", "json", *input_args(src)], PROBE_TIMEOUT_SEC).stdout
        st = json.loads(out)["streams"][0]
    except (subprocess.CalledProcessError, KeyError, IndexError, ValueError):
        return None
    bits = int(st.get("bits_per_raw_sample") or st.get("bits_per_sample") or 0)
    info = {"ext": src.suffix.lower(), "codec": st.get("codec_name"), "sample_rate": int(st.get("sample_rate") or 0),
            "bits": bits, "channels": int(st.get("channels") or 0)}
    info |= _silence(src, float(json.loads(run_ffmpeg(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                                      "-of", "json", *input_args(src)], PROBE_TIMEOUT_SEC).stdout)
                                ["format"]["duration"]))
    info |= _loudness(src)
    jf.write_json(cached, info)
    return info


def _loudness(src) -> dict:
    """통합 음량(LUFS)·트루 피크(dBTP) — ffmpeg ebur128. 읽지 못하면 빈 값 (검사는 '직접 확인'으로)."""
    try:
        err = run_ffmpeg(["ffmpeg", "-hide_banner", "-nostats", *input_args(src), "-af", "ebur128=peak=true",
                          "-f", "null", "-"], 300).stderr
    except subprocess.CalledProcessError:
        return {"true_peak": None, "lufs": None}
    summary = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summary)
    pk = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary)

    def num(m):
        return None if not m or m.group(1) == "-inf" else float(m.group(1))
    return {"true_peak": num(pk), "lufs": num(i)}


def _silence(src, duration: float) -> dict:
    """앞뒤 무음(-50dB 아래) 길이. 읽지 못하면 빈 dict."""
    try:
        err = run_ffmpeg(["ffmpeg", "-hide_banner", "-nostats", *input_args(src), "-af",
                          "silencedetect=noise=-50dB:d=0.3", "-f", "null", "-"], 300).stderr
    except subprocess.CalledProcessError:
        return {}
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    head = ends[0] if starts and starts[0] <= 0.05 and ends else 0.0
    tail = duration - starts[-1] if starts and (len(ends) < len(starts) or ends[-1] >= duration - 0.05) else 0.0
    return {"silence_head": round(head, 1), "silence_tail": round(max(tail, 0.0), 1)}


def _own_upload_size(jf: JobFiles, v: int) -> int | None:
    for e in jf.events():
        if e["event"] == "own_image_uploaded" and e.get("v") == v:
            return min(e["size"])
    return None


def submission_check(jf: JobFiles, song: dict, selected: dict | None, cover_path, duration: float,
                     today: date | None = None, *, release_info=None, rights=None) -> SubmissionCheck:
    """release_info: 발매 정보를 저장했으면 그 칸별 검사로 곡 정보를 본다 (10/10).
    rights: 권리 자가진단 결과(RightsResult) — 답한 항목은 '직접 확인' 대신 그 결과로."""
    today = today or today_kst()
    items: list[CheckItem] = []

    def add(group, id_, label, status, detail):
        items.append(CheckItem(group=group, id=id_, label=label, status=status, detail=detail))

    if release_info is not None:
        items += release_info
    else:
        _meta_from_song(add, song, today)
    _audio_cover_rights(jf, add, items, selected, cover_path, duration, rights)
    counts = {s: sum(1 for i in items if i.status == s) for s in ("ok", "warn", "fail", "todo")}
    return SubmissionCheck(items=items, counts=counts,
                           notice="흔히 반려되는 항목을 미리 걸러 주는 점검이에요. 유통사마다 기준이 조금씩 달라서 통과를 "
                                  "보장하지는 않아요. 최종 기준은 이용하는 유통사 안내를 확인하세요.")


def _meta_from_song(add, song: dict, today: date) -> None:
    """발매 정보를 아직 안 넣었을 때: 업로드 때 곡 정보로 본다 (10/9 방식)."""
    for key, name in (("title", "곡 제목"), ("artist", "아티스트 이름")):
        value = song.get(key) or ""
        if not value.strip():
            add("meta", key, name, "fail", f"{name}이 비어 있어요.")
        else:
            probs = _name_problems(value)
            tip = (" 다른 플랫폼에 이미 낸 곡이 있으면 그때와 똑같이 써야 같은 아티스트로 묶여요."
                   if key == "artist" else " 유통사 입력과 커버의 글자가 똑같아야 해요.")
            add("meta", key, name, "warn" if probs else "ok",
                " / ".join(probs) if probs else f"'{value.strip()}'.{tip}")
    add("meta", "genre", "장르", "ok" if song.get("genre") else "warn",
        f"{song['genre']} — 유통사 폼에서 1차·2차 장르를 골라요." if song.get("genre")
        else "장르를 정해 두세요. 유통사 폼에서 1차·2차 장르를 골라야 해요.")
    raw = song.get("release_date")
    if not raw:
        add("meta", "release_date", "발매일", "warn", "발매일을 정해 두세요. 발매 캘린더도 이 날짜로 계산해요.")
    else:
        left = (date.fromisoformat(raw) - today).days
        add("meta", "release_date", "발매일", "fail" if left < 0 else "warn" if left < 21 else "ok",
            f"{raw} — 지난 날짜는 유통사가 받지 않아요." if left < 0
            else f"{raw} (D-{left}) — 유통사 리드타임(7일~3주)이 빠듯해요. 유통사에 바로 확인하세요." if left < 21
            else f"{raw} (D-{left}).")
    add("meta", "lyrics", "가사", "ok" if song.get("lyrics") else "todo",
        "가사가 있어요. 유통사에 가사 텍스트와 가사 언어를 함께 내세요." if song.get("lyrics")
        else "가사가 있는 곡이면 가사 텍스트와 가사 언어를 함께 내세요 (연주곡이면 넘어가도 돼요).")
    add("meta", "album", "앨범명", "todo", "싱글도 앨범명이 필요해요. 보통 곡 제목과 같게 써요.")
    add("meta", "explicit", "19금(Explicit) 여부", "todo", "욕설·선정적 가사가 있으면 표시해야 해요. 빠뜨리면 반려·삭제될 수 있어요.")


def _audio_cover_rights(jf: JobFiles, add, items: list, selected: dict | None, cover_path, duration: float,
                        rights) -> None:
    # 음원
    a = _probe_audio(jf)
    if a is None:
        add("audio", "format", "음원 형식", "todo", "원본 파일 정보를 읽지 못했어요. 유통사에는 WAV(44.1kHz/16bit 이상)를 내세요.")
    elif a["ext"] == ".mp3":
        add("audio", "format", "음원 형식", "fail",
            "mp3(손실 압축)로 올렸어요. 유통사는 WAV(44.1kHz/16bit 이상)만 받는 곳이 대부분이에요. 마스터링한 WAV를 내세요.")
    else:
        sr, bits = a["sample_rate"], a["bits"]
        ok = sr >= 44100 and (bits == 0 or bits >= 16)
        add("audio", "format", "음원 형식", "ok" if ok else "fail",
            f"무손실 원본 ({sr / 1000:g}kHz{f' / {bits}bit' if bits else ''}). 유통사에는 처음 올린 WAV를 그대로 내세요."
            if ok else f"{sr / 1000:g}kHz{f' / {bits}bit' if bits else ''} — 44.1kHz·16bit 이상이어야 해요.")
    if a and a.get("ext") != ".mp3" and a.get("channels"):
        add("audio", "channels", "채널", "ok" if a["channels"] == 2 else "warn",
            "스테레오(2채널)." if a["channels"] == 2
            else f"{a['channels']}채널 — 유통사는 보통 스테레오 파일을 받아요. 마스터를 스테레오로 내보내세요.")
    if a and a.get("true_peak") is not None:
        tp = a["true_peak"]
        add("audio", "true_peak", "트루 피크", "ok" if tp <= -1.0 else "warn",
            f"{tp:+.1f} dBTP — 여유가 있어요." if tp <= -1.0
            else f"{tp:+.1f} dBTP — " + ("0dB를 넘어 소리가 깨질(클리핑) 수 있어요. " if tp >= 0 else "")
            + "플랫폼이 음량을 맞추거나 압축할 때 찌그러지지 않게 -1dBTP 아래로 마스터링하는 걸 권장해요 (Spotify 권고).")
    elif a and a.get("ext") != ".mp3":
        add("audio", "true_peak", "트루 피크", "todo", "피크를 재지 못했어요. 마스터링 때 -1dBTP 아래인지 확인하세요.")
    if a and a.get("lufs") is not None:
        add("audio", "loudness", "음량 (LUFS)", "ok",
            f"{a['lufs']:.1f} LUFS — 참고: Spotify는 기본 -14 LUFS 근처로 음량을 맞춰 재생해요. 이보다 크게 만들어도 "
            "더 크게 들리지 않고 줄어들기만 해요." if a["lufs"] > -14 else
            f"{a['lufs']:.1f} LUFS — 참고: Spotify는 기본 -14 LUFS 근처로 음량을 맞춰 재생해요.")
    if a and "silence_head" in a:
        head, tail = a["silence_head"], a["silence_tail"]
        long_ = head > 2 or tail > 5
        add("audio", "silence", "앞뒤 무음", "warn" if long_ else "ok",
            f"앞 {head:g}초 · 뒤 {tail:g}초" + (" — 무음이 길면 검수에서 걸릴 수 있어요. 마스터 파일에서 잘라 주세요." if long_ else "."))
    add("audio", "duration", "곡 길이", "ok" if duration >= 60 else "warn",
        f"{int(duration // 60)}분 {int(duration % 60)}초." if duration >= 60
        else f"{int(duration)}초 — 너무 짧은 곡은 유통사·플랫폼 기준에 걸릴 수 있어요 (스트리밍은 30초 이상 재생해야 집계).")

    # 커버 (반려 1순위)
    if not selected or cover_path is None:
        add("cover", "selected", "커버", "todo", "커버를 고르면 커버 항목을 검사해요.")
    else:
        own = selected["item_id"] == "cover-own"
        with Image.open(cover_path) as im:
            w, h = im.size
        add("cover", "size", "크기·비율", "ok" if w == h and w >= 3000 else "fail",
            f"{w}×{h}px 정사각 (3000×3000, JPG·PNG)." if w == h and w >= 3000
            else f"{w}×{h}px — 3000×3000 정사각이 필요해요.")
        src = _own_upload_size(jf, selected["v"]) if own else 1024
        insp_path = jf.cover_inspection(selected["item_id"], selected["v"])
        insp = jf.read_json(insp_path) if insp_path.exists() else None
        if src and src < 3000:
            blurry = bool(insp and insp.get("blurry"))
            add("cover", "sharpness", "선명도", "warn",
                f"원본({src}px)을 3000px로 키운 이미지예요." + (" AI 검사에서도 흐릿하다고 봤어요." if blurry else "")
                + " 크게 열어 흐리거나 깨진 곳이 없는지 확인하세요. 흐리면 반려될 수 있어요.")
        else:
            add("cover", "sharpness", "선명도", "ok", "원본이 3000px 이상이에요.")
        if insp is None:
            add("cover", "content", "커버 속 글자·로고", "todo",
                "자동 검사 결과가 없어요. 깨진 글자·워터마크·로고·URL·SNS 아이디·선정적 이미지가 없는지 직접 확인하세요.")
        else:
            found = []
            if insp.get("garbled_text"):
                found.append("깨진 글자")
            elif insp.get("has_text"):
                found.append(f"글자({insp.get('text_found') or '읽을 수 없음'})")
            if insp.get("watermark_or_logo"):
                found.append("워터마크·로고")
            if insp.get("url_or_handle"):
                found.append("URL·SNS 아이디")
            if insp.get("explicit_content"):
                found.append("선정적·폭력적 이미지")
            add("cover", "content", "커버 속 글자·로고", "fail" if found else "ok",
                (f"AI 검사에서 찾음: {', '.join(found)} — {insp.get('notes', '')} 다시 만들거나 다른 커버를 고르세요."
                 if found else "AI 검사에서 글자·워터마크·로고·URL·선정적 이미지를 찾지 못했어요. 그래도 크게 열어 한 번 보세요.")
                + (" (제목 얹은 버전을 쓰면 글자가 입력한 제목·아티스트와 같아요.)" if not found else ""))

    # 권리 — 자가진단에 답했으면 그 결과, 아니면 직접 확인 목록
    answered = {i.id for i in rights.items} if rights is not None else set()
    if rights is not None:
        items += rights.items
    covered = {"own_song": "song_type", "samples": "samples", "ai_music": "ai_audio", "cover_rights": "cover_image"}
    for id_, label, detail in (
        ("credits", "크레딧", "작사·작곡·편곡자 실명, ©(저작권자)·℗(음원 권리자) 표기를 정리해 두세요."),
        ("codes", "ISRC·UPC", "곡 코드(ISRC)·발매 코드(UPC)는 보통 유통사가 발급해요. 이미 받은 코드가 있으면 그대로 쓰세요."),
        ("own_song", "자작곡 확약", "본인(밴드)이 권리를 가진 곡이어야 해요. 다른 사람 곡을 부른 커버곡은 원곡자의 서면 허가 없이는 "
                                  "국내 주요 플랫폼에 낼 수 없어요."),
        ("samples", "샘플·비트", "구매한 비트·샘플팩·다른 곡 인용이 있으면 상업 발매 사용 허락(클리어런스)을 확인하세요."),
        ("ai_music", "AI 사용 공개", "음원 제작에 AI를 썼다면 유통사·플랫폼의 AI 정책을 먼저 확인하세요 (공개 의무, 국내 발매 제한, "
                                    "추천 제외 등 곳마다 다르고 자주 바뀌어요). 이 서비스가 만든 커버·글도 AI 생성물이에요."),
        ("cover_rights", "커버 권리", "직접 올린 사진·그림이면 촬영자·작가의 사용 동의를 받아 두세요."),
        ("abuse", "금지 행위", "유명 아티스트 이름 사칭, 같은 음원 중복 등록, 재생수 부풀리기는 계정 정지 사유예요."),
    ):
        if covered.get(id_) in answered or (id_ == "credits" and any(i.id == "credits" for i in items)):
            continue
        add("rights", id_, label, "todo", detail)

    # 유통과 별개
    for id_, label, detail in (
        ("kmca", "저작권협회 등록", "유통사 제출은 음원 '전달'이에요. 작사·작곡 저작권료는 한국음악저작권협회(음저협)에 따로 등록해야 받아요."),
        ("broadcast", "방송 심의", "TV·라디오에 나가려면 유통사 검수와 별도로 방송 심의를 받아야 해요 (대행 서비스가 있어요)."),
        ("for_artists", "아티스트 계정", "발매 후 Spotify for Artists·Apple Music for Artists에서 아티스트 프로필을 인증(클레임)하세요. "
                                       "Canvas 영상도 여기서 올려요."),
        ("synced_lyrics", "싱크 가사", "애플뮤직 싱크 가사는 Musixmatch에서 따로 등록해요."),
    ):
        add("extra", id_, label, "todo", detail)
