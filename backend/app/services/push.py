"""Web Push notification service."""
import json
from pywebpush import webpush, WebPushException
from app.core.config import get_settings

settings = get_settings()

def send_push_notification(subscription_info, data):
    """
    Send a web push notification to a specific subscription.
    subscription_info: dict containing endpoint, keys (p256dh, auth)
    data: dict with title, body, icon, url
    """
    print(f"[PUSH] Sending to endpoint: {subscription_info.get('endpoint', 'unknown')[:80]}...")
    print(f"[PUSH] VAPID Public Key present: {bool(settings.VAPID_PUBLIC_KEY)}")
    print(f"[PUSH] VAPID Private Key present: {bool(settings.VAPID_PRIVATE_KEY)}")
    print(f"[PUSH] VAPID Email: {settings.VAPID_CLAIMS_EMAIL}")
    
    try:
        result = webpush(
            subscription_info=subscription_info,
            data=json.dumps(data),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={
                "sub": f"mailto:{settings.VAPID_CLAIMS_EMAIL}"
            }
        )
        print(f"[PUSH] SUCCESS! Status: {result.status_code}")
        return True
    except WebPushException as ex:
        print(f"[PUSH] WebPushException: {ex}")
        if hasattr(ex, 'response') and ex.response is not None:
            print(f"[PUSH] Response status: {ex.response.status_code}")
            print(f"[PUSH] Response body: {ex.response.text[:500]}")
        return False
    except Exception as e:
        print(f"[PUSH] General Error: {type(e).__name__}: {e}")
        return False
