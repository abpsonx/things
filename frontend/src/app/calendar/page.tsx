"use client";

import React, { useState, useEffect, useCallback } from "react";

import api from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Clock,
  Loader2,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function GlobalCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGlobalEvents = useCallback(async () => {
    try {
      const res = await api.get("/projects/any/events/me"); // Note: any is dummy for prefix match
      setEvents(res.data);
    } catch (err) {
      console.error("Failed to fetch global events", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalEvents();
  }, [fetchGlobalEvents]);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const paddingDays = firstDayOfMonth(year, month);
  const totalDays = [...Array(paddingDays).fill(null), ...days];

  const getEventsForDay = (day: number) => {
    return events.filter(event => {
      const eventDate = new Date(event.start_at);
      return eventDate.getDate() === day && 
             eventDate.getMonth() === month && 
             eventDate.getFullYear() === year;
    });
  };

  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Kalender Global</h1>
          <p className="text-muted-foreground">Semua agenda proyek kamu dalam satu tampilan.</p>
        </div>

        {/* Calendar Header */}
        <div className="flex items-center justify-between bg-card p-5 border border-border rounded-2xl shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 border border-border rounded-xl overflow-hidden bg-background">
              <button onClick={prevMonth} className="p-2.5 hover:bg-secondary transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goToToday} className="px-4 py-2 text-[10px] font-bold border-x border-border hover:bg-secondary transition-colors uppercase tracking-widest">Hari Ini</button>
              <button onClick={nextMonth} className="p-2.5 hover:bg-secondary transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <h2 className="text-xl font-bold tracking-tight">{monthName} {year}</h2>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-xl">
          <div className="grid grid-cols-7 border-b border-border bg-secondary/20">
            {dayLabels.map(day => (
              <div key={day} className="py-4 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{day}</div>
            ))}
          </div>
          
          {loading ? (
            <div className="h-[600px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-7 auto-rows-[120px] md:auto-rows-[160px]">
              {totalDays.map((day, i) => {
                const isToday = day === new Date().getDate() && 
                                month === new Date().getMonth() && 
                                year === new Date().getFullYear();
                
                const dayEvents = day ? getEventsForDay(day) : [];

                return (
                  <div key={i} className={cn(
                    "border-r border-b border-border p-3 space-y-2 hover:bg-secondary/10 transition-colors group relative",
                    (i + 1) % 7 === 0 && "border-r-0",
                    !day && "bg-secondary/5"
                  )}>
                    {day && (
                      <>
                        <div className={cn(
                          "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-full transition-all",
                          isToday ? "bg-primary text-primary-foreground shadow-lg scale-110" : "text-muted-foreground group-hover:text-foreground"
                        )}>
                          {day}
                        </div>
                        
                        <div className="space-y-1.5 overflow-y-auto max-h-[80px] md:max-h-[110px] custom-scrollbar">
                          {dayEvents.map((event) => (
                            <div 
                              key={event.id} 
                              className="px-2 py-1.5 bg-secondary border-l-2 border-primary rounded-r-md text-[9px] font-bold text-foreground hover:bg-secondary/80 transition-all cursor-pointer truncate shadow-sm"
                              title={`${event.title} - ${event.project?.name}`}
                            >
                              <div className="flex items-center gap-1 text-primary mb-0.5">
                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              {event.title}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
