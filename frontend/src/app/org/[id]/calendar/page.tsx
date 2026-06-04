"use client";

import { useParams } from "next/navigation";
import UnifiedCalendar from "@/components/calendar/UnifiedCalendar";

export default function WorkspaceCalendarPage() {
  const { id: orgId } = useParams();
  return (
    <UnifiedCalendar
      scope={{ type: "org", orgId: orgId as string }}
      title="Kalender Workspace"
      subtitle="Meeting & acara seluruh workspace."
    />
  );
}
