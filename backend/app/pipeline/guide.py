"""처음 발매하는 사람용 안내 (03 기획서 E): 발매가 어떻게 되는지 + 나에게 맞는 유통사 고르기.

내용은 02 조사 정리(§3) 기준이고, 화면에 그대로 보여도 되는 쉬운 말로 쓴다. 바뀌면 이 파일만 고친다.
"""
from app.pipeline.distributors import PROFILES
from app.schemas.release import GuideRecommendation, GuideRecommendRequest

STEPS = [
    {"id": "how", "title": "멜론·스포티파이에 직접 올릴 수는 없어요",
     "body": "개인은 음원 사이트에 바로 올릴 수 없고, 반드시 '유통사'를 거쳐야 해요. 유통사가 내 음원과 정보를 "
             "멜론·지니·스포티파이·유튜브 뮤직 같은 곳에 전달해 줘요. 수정도 유통사를 통해서만 할 수 있어요."},
    {"id": "choose", "title": "유통사 고르기",
     "body": "국내(멜론 등)와 해외(스포티파이 등)를 한 번에 맡는 곳도 있고, 해외만 맡는 곳도 있어요. "
             "해외 유통사 중에는 멜론에 못 보내는 곳이 많아서, 국내도 원하면 국내 유통사를 같이 써요. "
             "아래 질문에 답하면 처음 하는 사람에게 맞는 곳을 알려 드려요."},
    {"id": "prepare", "title": "준비물",
     "body": "① 마스터링한 WAV 음원(44.1kHz·16bit 이상) ② 3000×3000 정사각 커버(글자·로고·URL 없이) "
             "③ 곡 정보(제목·아티스트·장르·발매일) ④ 크레딧(작사·작곡·편곡 — 작곡가는 실명) ⑤ 가사 텍스트. "
             "이 서비스에서 커버를 만들고, 정보를 넣고, 미리 검사할 수 있어요."},
    {"id": "check", "title": "올리기 전에 미리 검사",
     "body": "음원 형식·음량, 커버 크기·금지 요소, 제목 표기(피처링·버전은 따로), 권리(커버곡·샘플·AI)를 미리 확인하면 "
             "반려·지연 위험을 줄일 수 있어요. 통과를 보장하지는 않아요 — 최종 기준은 유통사 안내예요."},
    {"id": "schedule", "title": "일정",
     "body": "발매일 4~5주 전에 유통사에 올리는 게 좋아요. 스포티파이 에디토리얼 피칭은 늦어도 발매 7일 전까지 내야 "
             "팔로워의 Release Radar에 들어가요. 국내는 오후 6시 발매가 흔해요."},
    {"id": "after", "title": "발매 뒤",
     "body": "스포티파이 for Artists·멜론 파트너센터에서 아티스트 프로필을 인증하면 통계를 볼 수 있어요. "
             "작사·작곡 저작권료는 한국음악저작권협회에 따로 등록해야 받아요."},
    {"id": "reaction", "title": "반응이 궁금하다면",
     "body": "발매 전이라도 커뮤니티에 하이라이트나 전곡을 올려 다른 사람들의 별점·한마디를 받아 볼 수 있어요."},
]


def recommend(req: GuideRecommendRequest) -> GuideRecommendation:
    m, d = PROFILES["muzeplatform"], PROFILES["distrokid"]
    cautions = ["유통사 정책·가격은 자주 바뀌어요. 가입 전에 공식 안내를 꼭 확인하세요 (조사 기준일 "
                f"{m.checked_at})."]
    if req.ai_audio:
        cautions.append("AI로 만든 음원은 유통사마다 규칙이 달라요. 국내 플랫폼에 AI 음원을 받지 않는 유통사도 있으니 "
                        "가입 전에 AI 정책을 먼저 확인하세요. DistroKid는 AI 크레딧이 필요해요.")
    if req.where == "global":
        return GuideRecommendation(
            plan=["distrokid"], title="해외만: DistroKid",
            reasons=["누구나 가입하고 스포티파이·유튜브 뮤직 등에 빠르게 보내요.", d.cost, d.lead_time],
            cautions=cautions + ["멜론 등 국내 사이트에는 보내지 않아요. 나중에 국내도 원하면 국내 유통사를 따로 써요.",
                                 "구독을 끊으면 음원이 내려가요."])
    if req.where == "domestic" or req.budget == "free":
        return GuideRecommendation(
            plan=["muzeplatform"], title=f"{'국내' if req.where == 'domestic' else '국내·해외 한 번에'}: 뮤즈플랫폼",
            reasons=["누구나 가입할 수 있고 심사가 없어서 처음 하는 사람에게 문턱이 낮아요.",
                     f"국내 5대 사이트와 해외 플랫폼까지 한 번에 보내요. {m.stores}",
                     "BASIC은 등록비 없이 시작할 수 있어요 (대신 수수료 20%).", m.lead_time],
            cautions=cautions + ["음원·커버 공식 규격 문서는 확인하지 못했어요. WAV·3000px로 준비하면 안전해요."])
    return GuideRecommendation(
        plan=["muzeplatform", "distrokid"], title="국내는 뮤즈플랫폼 + 해외는 DistroKid",
        reasons=["국내 사이트는 국내 유통사가, 해외는 해외 유통사가 맡는 '나눠서 보내기'가 흔한 방법이에요.",
                 "DistroKid는 해외 반영이 빠르고, 뮤즈플랫폼은 멜론 등 국내 사이트에 보내요."],
        cautions=cautions + ["같은 곡을 두 유통사로 같은 플랫폼에 보내면 충돌이 생겨요. 뮤즈플랫폼에서 보낼 곳을 국내만 고를 수 있는지 먼저 확인하세요.",
                             "한 곡의 ISRC가 두 개로 갈리지 않게, 먼저 받은 ISRC를 다른 유통사에 넣을 수 있는지 확인하세요."])
