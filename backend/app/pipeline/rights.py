"""권리 자가진단 (03 기획서 C): 질문 몇 개에 답하면 이대로 발매·공개해도 되는지, 챙길 서류가 뭔지 알려 준다.

근거 (02 조사 정리 §3.3·6.5): DistroKid — 커버곡 라이선스(최대 14영업일), AI가 일부라도 만든 트랙은 AI 크레딧, 커버 이미지
사용권 / Spotify — 다른 아티스트 목소리 무단 흉내 금지 / 루트노트(유통사 자료) — 국내 플랫폼 AI 음원 불가.
법률 자문이 아니라 흔한 반려·분쟁 사유를 미리 짚는 점검이다.
"""
from app.pipeline.jobfiles import JobFiles
from app.schemas.package import CheckItem
from app.schemas.release import RightsQuestion, RightsResult

FILE = "rights.json"

QUESTIONS: list[RightsQuestion] = [
    RightsQuestion(id="song_type", question="이 곡은 어떤 곡인가요?",
                   options={"original": "내가(우리가) 만든 곡", "cover": "다른 사람 곡을 부르거나 연주한 곡",
                            "remix": "다른 곡을 리믹스·편곡한 곡"}),
    RightsQuestion(id="cowriters", question="작사·작곡을 함께한 사람이 있나요?",
                   help="함께 만든 사람이 있으면 발매 전에 동의와 수익 나누기(지분)를 정해 둬야 해요.",
                   options={"none": "혼자 만들었어요", "agreed": "있고, 발매에 동의받았어요", "not_yet": "있는데 아직 얘기 안 했어요"}),
    RightsQuestion(id="beat", question="반주(비트)는 어떻게 만들었나요?",
                   options={"own": "직접 만들었어요", "lease": "비트를 구매(리스)했어요", "exclusive": "비트를 독점 구매했어요",
                            "free": "무료로 받은 비트예요"}),
    RightsQuestion(id="samples", question="다른 소리를 가져다 쓴 부분이 있나요?",
                   options={"none": "없어요", "pack": "샘플팩(라이선스 있는 소리 모음)을 썼어요",
                            "other_song": "다른 곡의 일부를 잘라 썼어요"}),
    RightsQuestion(id="ai_audio", question="음원을 만들 때 AI를 썼나요?",
                   help="커버·홍보 글을 이 서비스의 AI로 만든 것과는 별개예요. 음원(소리) 기준이에요.",
                   options={"none": "안 썼어요", "tool": "믹싱·마스터링·보컬 정리 같은 도구로만", "generated": "AI가 곡이나 목소리를 만들었어요 (Suno 등)"}),
    RightsQuestion(id="voice", question="다른 가수의 목소리를 흉내 낸 AI 목소리가 들어 있나요?",
                   options={"no": "아니요", "yes": "네"}),
    RightsQuestion(id="performers", question="세션 연주자·보컬이 참여했나요?",
                   options={"no": "아니요", "agreed": "네, 발매에 동의받았어요", "not_yet": "네, 아직 동의는 안 받았어요"}),
    RightsQuestion(id="cover_image", question="앨범 커버는 무엇으로 하나요?",
                   options={"ai_service": "이 서비스에서 만든 AI 커버", "own_photo": "내가 찍거나 그린 이미지",
                            "permitted": "다른 사람 사진·그림 (허락받음)", "unknown": "인터넷에서 찾은 이미지"}),
    RightsQuestion(id="released_before", question="이 곡을 이미 다른 곳으로 발매했나요?",
                   options={"no": "처음 내요", "yes": "다른 유통사로 이미 냈어요"}),
    RightsQuestion(id="minor", question="만 19세 미만인가요?",
                   help="유통 계약은 법률 행위라 미성년자는 법정대리인(부모님 등) 동의가 필요해요.",
                   options={"no": "아니요", "yes": "네"}),
]
_BY_ID = {q.id: q for q in QUESTIONS}


def load(jf: JobFiles) -> dict[str, str]:
    p = jf.root / FILE
    return jf.read_json(p) if p.exists() else {}


def save(jf: JobFiles, answers: dict[str, str]) -> dict[str, str]:
    clean = {k: v for k, v in answers.items() if k in _BY_ID and v in _BY_ID[k].options}
    jf.write_json(jf.root / FILE, clean)
    jf.event("rights_saved", answered=len(clean))
    return clean


def evaluate(answers: dict[str, str]) -> RightsResult:
    items: list[CheckItem] = []
    docs: list[str] = []

    def add(id_, label, status, detail):
        items.append(CheckItem(group="rights", id=id_, label=label, status=status, detail=detail))

    a = answers.get
    st = a("song_type")
    if st == "original":
        add("song_type", "자작곡", "ok", "직접 만든 곡이에요.")
    elif st == "cover":
        add("song_type", "커버곡", "fail", "다른 사람 곡은 원곡 권리자의 허락(커버 라이선스) 없이는 발매·공개할 수 없어요. "
                                        "해외 유통사는 커버 라이선스를 대신 받아 주기도 해요(DistroKid는 최대 14영업일). "
                                        "국내 플랫폼은 원곡자 서면 허가가 필요한 경우가 많아요.")
        docs.append("원곡 권리자의 사용 허가서 또는 유통사 커버 라이선스 확인")
    elif st == "remix":
        add("song_type", "리믹스·편곡", "fail", "원곡 권리자의 허락 없이는 발매·공개할 수 없어요.")
        docs.append("원곡 권리자의 리믹스·편곡 허가서")

    cw = a("cowriters")
    if cw == "not_yet":
        add("cowriters", "공동 창작자", "fail", "함께 만든 사람의 동의 없이 내면 분쟁이 생겨요. 발매 전에 동의와 지분을 정하세요.")
    elif cw == "agreed":
        add("cowriters", "공동 창작자", "ok", "동의받았어요. 지분을 적은 문서(스플릿 시트)를 남겨 두세요.")
        docs.append("공동 창작자 동의·지분 기록 (스플릿 시트)")
    elif cw == "none":
        add("cowriters", "공동 창작자", "ok", "혼자 만든 곡이에요.")

    beat = a("beat")
    if beat == "free":
        add("beat", "비트", "warn", "무료 비트는 '비상업적 사용만' 조건이 많아요. 음원 발매(상업적 이용)가 되는지 조건을 확인하세요.")
        docs.append("비트 사용 조건 화면 캡처")
    elif beat in ("lease", "exclusive"):
        add("beat", "비트", "ok" if beat == "exclusive" else "warn",
            "독점 구매 — 계약서를 보관하세요." if beat == "exclusive"
            else "리스 비트는 스트리밍 횟수·발매 범위 제한이 있는 경우가 많아요. 계약 조건과 크레딧 표기(프로듀서명)를 확인하세요.")
        docs.append("비트 구매 영수증·계약서")
    elif beat == "own":
        add("beat", "비트", "ok", "직접 만든 반주예요.")

    sm = a("samples")
    if sm == "other_song":
        add("samples", "샘플", "fail", "다른 곡의 일부를 쓰려면 원곡 권리자의 허락(샘플 클리어런스)이 필요해요. 허락 없이 내면 반려·삭제될 수 있어요.")
        docs.append("샘플 사용 허가서")
    elif sm == "pack":
        add("samples", "샘플", "ok", "라이선스 있는 샘플팩이에요. 구매 영수증을 보관하세요.")
        docs.append("샘플팩 구매 영수증")
    elif sm == "none":
        add("samples", "샘플", "ok", "가져다 쓴 소리가 없어요.")

    ai = a("ai_audio")
    if ai == "generated":
        add("ai_audio", "AI 음원", "warn", "AI가 만든 음원은 유통사마다 규칙이 달라요. DistroKid는 AI 크레딧을 넣어야 하고, "
                                         "국내 플랫폼에는 AI 음원을 받지 않는 유통사도 있어요(루트노트 안내). 저작권 등록이 안 될 수 있어요. "
                                         "고른 유통사의 AI 정책을 먼저 확인하세요.")
        docs.append("사용한 AI 서비스의 상업적 이용 조건 (요금제 포함)")
    elif ai == "tool":
        add("ai_audio", "AI 음원", "ok", "도구로만 쓴 경우는 보통 AI 크레딧이 필요 없어요 (DistroKid 기준).")
    elif ai == "none":
        add("ai_audio", "AI 음원", "ok", "AI를 쓰지 않았어요.")

    if a("voice") == "yes":
        add("voice", "목소리 흉내", "fail", "다른 가수 목소리를 허락 없이 흉내 낸 음원은 Spotify 등에서 금지예요. 발매·공개하면 안 돼요.")
    elif a("voice") == "no":
        add("voice", "목소리 흉내", "ok", "해당 없음.")

    pf = a("performers")
    if pf == "not_yet":
        add("performers", "참여 연주자", "warn", "세션 연주자·보컬에게 발매 동의를 받고 크레딧 표기 방법을 정하세요.")
    elif pf == "agreed":
        add("performers", "참여 연주자", "ok", "동의받았어요. 크레딧에 넣어 주세요.")
        docs.append("참여 연주자 동의 기록")
    elif pf == "no":
        add("performers", "참여 연주자", "ok", "해당 없음.")

    ci = a("cover_image")
    if ci == "unknown":
        add("cover_image", "커버 이미지", "fail", "인터넷에서 찾은 이미지는 사용권이 없어 반려돼요. 직접 만든 이미지나 이 서비스의 커버를 쓰세요.")
    elif ci == "permitted":
        add("cover_image", "커버 이미지", "ok", "허락받은 이미지 — 허락받은 기록을 보관하세요.")
        docs.append("커버 이미지 사용 허락 기록")
    elif ci == "ai_service":
        add("cover_image", "커버 이미지", "ok", "이 서비스의 AI 커버예요. 플랫폼의 AI 생성물 표기 정책을 확인하세요.")
    elif ci == "own_photo":
        add("cover_image", "커버 이미지", "ok", "직접 만든 이미지예요. 사람이 나오면 그 사람의 동의를 받아 두세요.")

    if a("released_before") == "yes":
        add("released_before", "중복 발매", "warn", "같은 곡을 두 유통사로 같은 플랫폼에 보내면 중복·충돌이 생겨요. "
                                                 "기존 유통사에서 내린 뒤(테이크다운) 옮기거나, 플랫폼 범위를 겹치지 않게 나누세요.")
        docs.append("기존 유통사 테이크다운 확인 / 기존 ISRC")
    elif a("released_before") == "no":
        add("released_before", "중복 발매", "ok", "처음 내는 곡이에요.")

    if a("minor") == "yes":
        add("minor", "미성년자", "warn", "유통 계약에 법정대리인(부모님 등) 동의가 필요해요. 유통사 안내를 확인하세요.")
        docs.append("법정대리인 동의서")
    elif a("minor") == "no":
        add("minor", "미성년자", "ok", "해당 없음.")

    complete = all(q.id in answers for q in QUESTIONS)
    return RightsResult(answers=answers, complete=complete, items=items, documents=list(dict.fromkeys(docs)))
