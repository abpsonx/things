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
