"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import AddEventModal from "./AddEventModal";
import EventDetailModal from "./EventDetailModal";
import api from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const { id: orgId, projectId } = useParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${projectId}/events`);
      setEvents(res.data);
    } catch (err) {
      console.error("Failed to fetch events", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) fetchEvents();
  }, [projectId, fetchEvents]);

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

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await api.delete(`/projects/${projectId}/events/${eventId}`);
      setIsDetailOpen(false);
      fetchEvents();
    } catch (err) {
      console.error("Failed to delete event", err);
      alert("Gagal menghapus event");
    }
  };

  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  return (
    <div className="space-y-6">
        {/* Calendar Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 border border-border rounded-2xl shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 border border-border rounded-xl overflow-hidden bg-background">
              <button onClick={prevMonth} className="p-2.5 hover:bg-secondary transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goToToday} className="px-4 py-2 text-[10px] font-bold border-x border-border hover:bg-secondary transition-colors uppercase tracking-widest">Hari Ini</button>
              <button onClick={nextMonth} className="p-2.5 hover:bg-secondary transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <h2 className="text-xl font-bold tracking-tight">{monthName} {year}</h2>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Event Baru
          </button>
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
                              onClick={() => { setSelectedEvent(event); setIsDetailOpen(true); }}
                              className="px-2 py-1.5 bg-primary/5 border-l-2 border-primary rounded-r-md text-[9px] font-bold text-primary hover:bg-primary/10 transition-all cursor-pointer truncate"
                              title={event.title}
                            >
                              <div className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              {event.title}
                            </div>
                          ))}
                        </div>

                        {/* Hover Plus Button */}
                        <button 
                          onClick={() => setIsModalOpen(true)}
                          className="absolute bottom-2 right-2 p-1.5 bg-background border border-border rounded-lg opacity-0 group-hover:opacity-100 hover:border-primary transition-all shadow-sm"
                        >
                          <Plus className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      <AddEventModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projectId={projectId as string}
        onSuccess={fetchEvents}
      />

      <EventDetailModal 
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        event={selectedEvent}
        onDelete={handleDeleteEvent}
        onUpdate={fetchEvents}
      />
    </div>
  );
}
