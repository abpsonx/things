"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react";
import TeamNav from "@/components/team/TeamNav";
import UnifiedCalendar from "@/components/calendar/UnifiedCalendar";

export default function TeamCalendarPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const teamId = params.teamId as string;
  const [teamName, setTeamName] = useState<string>("");

  useEffect(() => {
    if (!orgId || !teamId) return;
    api.get(`/organizations/${orgId}/teams/${teamId}`)
      .then((r) => setTeamName(r.data?.name || ""))
      .catch(() => {});
  }, [orgId, teamId]);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-3 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 flex items-center gap-4 bg-card/80 dark:bg-card/60 backdrop-blur-md sticky top-0 z-30">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/20">
            <CalendarIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">{teamName || "Tim"}</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Jadwal Tim</p>
          </div>
        </div>
      </div>

      <TeamNav orgId={orgId} teamId={teamId} />

      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:p-8 max-w-6xl mx-auto w-full">
        <UnifiedCalendar scope={{ type: "team", orgId, teamId }} />
      </div>
    </div>
  );
}
