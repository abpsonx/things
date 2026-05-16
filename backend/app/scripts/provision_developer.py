"""Provision a developer account with global access.

Idempotent: safe to re-run. Creates (or updates) a user with role='developer'
and seeds OrgMember(role='owner') in every existing organization so the dev
account shows up natively in member lists.

Run inside the backend container:
    docker compose exec backend python -m app.scripts.provision_developer

Override defaults via env vars:
    DEV_EMAIL=dev@dothings.id
    DEV_PASSWORD=sonson77
    DEV_NAME="adhitya budhi p"
"""
import asyncio
import os
from sqlalchemy import select
from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import User
from app.models.organization import Organization, OrgMember


async def main() -> None:
    email = os.getenv("DEV_EMAIL", "dev@dothings.id")
    password = os.getenv("DEV_PASSWORD", "sonson77")
    name = os.getenv("DEV_NAME", "adhitya budhi p")

    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(password),
                role="developer",
                is_verified=True,
            )
            db.add(user)
            await db.flush()
            print(f"[+] Created user {email} (id={user.id}) with role=developer")
        else:
            user.name = name
            user.role = "developer"
            user.is_verified = True
            user.password_hash = hash_password(password)
            await db.flush()
            print(f"[~] Updated existing user {email} (id={user.id}) → role=developer, password reset")

        org_rows = (await db.execute(select(Organization.id))).scalars().all()
        existing_member_rows = await db.execute(
            select(OrgMember.org_id).where(OrgMember.user_id == user.id)
        )
        existing_org_ids = {row for row in existing_member_rows.scalars().all()}

        added = 0
        for org_id in org_rows:
            if org_id in existing_org_ids:
                continue
            db.add(OrgMember(org_id=org_id, user_id=user.id, role="owner"))
            added += 1

        await db.commit()
        print(f"[+] Seeded developer as owner in {added} new org(s); already member of {len(existing_org_ids)} org(s)")
        print(f"[✓] Done. Login: {email} / {password}")


if __name__ == "__main__":
    asyncio.run(main())
