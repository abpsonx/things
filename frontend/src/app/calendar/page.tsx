"use client";

import UnifiedCalendar from "@/components/calendar/UnifiedCalendar";

export default function GlobalCalendarPage() {
  return (
    <UnifiedCalendar
      scope={{ type: "global" }}
      title="Kalender Global"
      subtitle="Semua agenda kamu — event, deadline tugas, periode pengerjaan."
    />
  );
}
