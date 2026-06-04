"use client";

import { useParams } from "next/navigation";
import UnifiedCalendar from "@/components/calendar/UnifiedCalendar";

export default function ProjectCalendarPage() {
  const { id: orgId, projectId } = useParams();
  return (
    <UnifiedCalendar
      scope={{ type: "project", orgId: orgId as string, projectId: projectId as string }}
    />
  );
}
