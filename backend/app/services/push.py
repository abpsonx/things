"""Web Push notification service."""
import json
import logging
from pywebpush import webpush, WebPushException
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Push services return 404/410 when the subscription is permanently dead.
DEAD_SUBSCRIPTION_STATUSES = {404, 410}


def send_push_notification(subscription_info, data):
    """
    Send a web push notification to a specific subscription.

    Returns a tuple (outcome, detail) where outcome is one of:
      "sent"       — push delivered to the push service
      "dead"       — subscription expired or unknown; caller should delete it
      "failed"     — transient error; keep subscription for next attempt
    detail is a short string with status code / message for diagnostics.
    """
    endpoint = subscription_info.get("endpoint", "unknown")
    vapid_email = settings.VAPID_CLAIMS_EMAIL or "noreply@dothings.id"

    try:
        result = webpush(
            subscription_info=subscription_info,
            data=json.dumps(data),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{vapid_email}"},
            # Headers tell the push service to actually keep the message
            # if the device is offline (TTL>0), deliver it immediately
            # (high urgency), and let Chrome dedupe replays via a topic.
            ttl=60 * 60 * 24,  # keep up to 24h if device offline
            headers={
                "Urgency": "high",
                "Topic": "things-notif",
            },
        )
        status = getattr(result, "status_code", "?")
        body = ""
        try:
            body = result.text[:200]
        except Exception:
            pass
        logger.info(f"[PUSH] OK {status} body={body!r} → {endpoint[:80]}")
        return "sent", f"{status} {body[:60]}"
    except WebPushException as ex:
        status = getattr(getattr(ex, "response", None), "status_code", None)
        body = ""
        if getattr(ex, "response", None) is not None:
            try:
                body = ex.response.text[:300]
            except Exception:
                pass
        logger.warning(f"[PUSH] FAIL status={status} endpoint={endpoint[:80]} body={body}")
        if status in DEAD_SUBSCRIPTION_STATUSES:
            return "dead", f"{status} {body[:80]}"
        return "failed", f"{status} {body[:80]}"
    except Exception as e:
        logger.warning(f"[PUSH] ERROR {type(e).__name__}: {e}")
        return "failed", f"{type(e).__name__}: {str(e)[:120]}"
