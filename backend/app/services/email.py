import aiosmtplib
from email.message import EmailMessage
from app.core.config import get_settings

async def send_invitation_email(email: str, org_name: str, inviter_name: str, reg_code: str = None):
    settings = get_settings()
    
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        print("DEBUG: SMTP not configured. Skipping email send.")
        return False

    message = EmailMessage()
    message["From"] = settings.SMTP_USER
    message["To"] = email
    message["Subject"] = f"Undangan Bergabung ke {org_name} - Things App"

    reg_code_text = f"\nKode Registrasi Perusahaan: {reg_code}\n" if reg_code else ""

    content = f"""
    Halo,
    
    Anda telah diundang oleh {inviter_name} untuk bergabung ke workspace '{org_name}' di Things App.
    
    Silakan mendaftar menggunakan email ini di: {settings.FRONTEND_URL}/register
    {reg_code_text}
    Gunakan kode di atas saat mendaftar agar akun Anda langsung terhubung dengan organisasi ini.
    
    Selamat bekerja!
    Tim Things App
    """
    message.set_content(content)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASS,
            use_tls=settings.SMTP_PORT == 465,
            start_tls=settings.SMTP_PORT == 587,
        )
        print(f"DEBUG: Email sent to {email}")
        return True
    except Exception as e:
        print(f"DEBUG: Failed to send email to {email}: {e}")
        return False


async def send_digest_email(email: str, user_name: str, due_today, overdue, due_week):
    """Send a daily digest of the user's open tasks. Lists overdue first, then today, then this-week."""
    settings = get_settings()
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        print("DEBUG: SMTP not configured. Skipping digest send.")
        return False

    base_url = (settings.FRONTEND_URL or "").rstrip("/")

    def render_section(title, tasks):
        if not tasks:
            return ""
        lines = [f"\n{title}"]
        for t in tasks:
            org_id = str(t.project.org_id) if t.project else (str(t.team.org_id) if t.team else None)
            link = ""
            if org_id:
                if t.project_id:
                    link = f" — {base_url}/org/{org_id}/project/{t.project_id}/board?task={t.id}"
                elif t.team_id:
                    link = f" — {base_url}/org/{org_id}/team/{t.team_id}/board?task={t.id}"
            due_str = ""
            if t.due_date:
                due_str = f" (deadline {t.due_date.strftime('%d %b %Y')})"
            lines.append(f"  • {t.title}{due_str}{link}")
        return "\n".join(lines)

    total = len(due_today) + len(overdue) + len(due_week)
    if total == 0:
        return False  # don't spam when there's nothing actionable

    message = EmailMessage()
    message["From"] = settings.SMTP_USER
    message["To"] = email
    message["Subject"] = f"Ringkasan harian — {total} tugas menunggu"

    content = f"""
Halo {user_name},

Ringkasan tugasmu hari ini:
{render_section('⚠️  TERLAMBAT', overdue)}
{render_section('🔥 HARI INI', due_today)}
{render_section('📅 MINGGU INI', due_week)}

Buka Things untuk detail lengkap: {base_url}/dashboard

Tim Things
"""
    message.set_content(content)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASS,
            use_tls=settings.SMTP_PORT == 465,
            start_tls=settings.SMTP_PORT == 587,
        )
        return True
    except Exception as e:
        print(f"DEBUG: Failed to send digest to {email}: {e}")
        return False
