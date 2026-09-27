"""
====================================================================
[팀원 3 담당 구역] Resend Email Automation Service (email_service.py)
====================================================================
역할: 에셋 생성이 완료되면 Resend API를 통해 사용자의 이메일로
      고화질 앨범 커버 3종 다운로드 링크와 발매 홍보 카피를 자동 발송합니다.
"""

import os
from typing import Dict, Any

def send_release_package_email(recipient_email: str, package_data: Dict[str, Any]) -> bool:
    """
    Resend API를 사용하여 완성된 브랜딩 에셋 팩을 사용자 메일함으로 자동 전송합니다.
    """
    if not recipient_email or "@" not in recipient_email:
        print("[EmailService] 수신 이메일 주소가 유효하지 않아 이메일 발송을 건너뜁니다.")
        return False

    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        print(f"[EmailService] RESEND_API_KEY 미설정 (시뮬레이션 모드): {recipient_email} 메일 발송 완료로 처리")
        return True

    # TODO: [팀원 3 구현]
    # import resend
    # resend.api_key = api_key
    # params = {
    #     "from": "Indie Album Studio <onboarding@resend.dev>",
    #     "to": [recipient_email],
    #     "subject": f"🎉 [{package_data['concept_report']['project_title']}] 앨범 브랜딩 패키지 완성!",
    #     "html": "<strong>축하합니다! 완성된 앨범 패키지가 도착했습니다.</strong>..."
    # }
    # resend.Emails.send(params)
    return True
