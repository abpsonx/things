"""Helpers for resolving @mention tokens coming from the rich-text editor.

The editor emits one id per mention node. A plain UUID is a user; a token of
the form ``team:{team_id}`` means "everyone on this team" and must be expanded
into that team's member user-ids before we notify.
"""
from typing import Iterable


async def expand_mention_ids(db, raw_ids: Iterable) -> set[str]:
    """Return the set of concrete user-ids for the given mention tokens,
    expanding any ``team:{id}`` token into its members."""
    from sqlalchemy import select
    from app.models.team import TeamMember

    user_ids: set[str] = set()
    team_ids: list[str] = []
    for x in (raw_ids or []):
        s = str(x)
        if s.startswith("team:"):
            tid = s[len("team:"):]
            if tid:
                team_ids.append(tid)
        elif s:
            user_ids.add(s)

    if team_ids:
        res = await db.execute(select(TeamMember.user_id).where(TeamMember.team_id.in_(team_ids)))
        for (uid,) in res.all():
            user_ids.add(str(uid))
    return user_ids
