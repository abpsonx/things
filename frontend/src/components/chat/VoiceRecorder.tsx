"use client";

import { useRef, useState } from "react";
import { Mic, Trash2, Send, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Called with the recorded audio as a File once the user taps send. */
  onSend: (file: File) => Promise<void> | void;
  disabled?: boolean;
  /** Style hint for the trigger button color */
  className?: string;
}

function pickMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export default function VoiceRecorder({ onSend, disabled, className }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("");
  // When the user cancels we must NOT send on the recorder's stop event.
  const cancelledRef = useRef(false);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSeconds(0);
    setRecording(false);
  };

  const start = async () => {
    if (disabled) return;

    /* eslint-disable no-console */
    console.log("[VoiceRecorder] start() clicked");
    console.log("[VoiceRecorder] isSecureContext:", typeof window !== "undefined" ? window.isSecureContext : "n/a");
    console.log("[VoiceRecorder] location.protocol:", typeof location !== "undefined" ? location.protocol : "n/a");
    console.log("[VoiceRecorder] navigator.mediaDevices:", !!navigator.mediaDevices);
    console.log("[VoiceRecorder] getUserMedia:", !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
    console.log("[VoiceRecorder] MediaRecorder defined:", typeof MediaRecorder !== "undefined");

    // getUserMedia only exists in secure contexts (https or localhost).
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[VoiceRecorder] mediaDevices/getUserMedia missing — likely non-HTTPS or unsupported browser");
      alert("Browser tidak mendukung rekam audio, atau halaman tidak diakses lewat HTTPS.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      console.error("[VoiceRecorder] MediaRecorder undefined");
      alert("Browser tidak mendukung MediaRecorder. Coba update Chrome/Safari.");
      return;
    }

    // Surface enumerated devices for debugging
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      console.log("[VoiceRecorder] audioinput devices:", mics.length, mics.map((m) => ({ label: m.label, id: m.deviceId })));
    } catch (e) {
      console.warn("[VoiceRecorder] enumerateDevices failed", e);
    }

    let stream: MediaStream;
    try {
      console.log("[VoiceRecorder] requesting getUserMedia({ audio: true }) ...");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[VoiceRecorder] getUserMedia OK, tracks:", stream.getAudioTracks().map((t) => ({ label: t.label, state: t.readyState, enabled: t.enabled })));
    } catch (err: any) {
      const name = err?.name || "";
      console.error("[VoiceRecorder] getUserMedia FAILED:", { name, message: err?.message, err });
      let msg = "Tidak bisa akses mikrofon.";
      if (name === "NotAllowedError" || name === "SecurityError") msg = "Izin mikrofon ditolak. Aktifkan di setelan situs lalu reload.";
      else if (name === "NotReadableError" || name === "TrackStartError") msg = "Mikrofon sedang dipakai aplikasi lain (Zoom/Meet/dll). Tutup dulu lalu coba lagi.";
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") msg = "Tidak ada perangkat mikrofon terdeteksi.";
      else if (name) msg = `Gagal akses mikrofon (${name}: ${err?.message || ""}).`;
      alert(msg);
      return;
    }

    try {
      streamRef.current = stream;
      const mime = pickMime();
      console.log("[VoiceRecorder] pickMime ->", mime || "(default)");
      // Construct the recorder; if the chosen mime is rejected, fall back
      // to the browser default (no options).
      let mr: MediaRecorder;
      try {
        mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        mimeRef.current = mime || mr.mimeType || "";
      } catch (e) {
        console.warn("[VoiceRecorder] MediaRecorder(mime) rejected, falling back to default", e);
        mr = new MediaRecorder(stream);
        mimeRef.current = mr.mimeType || "";
      }
      console.log("[VoiceRecorder] MediaRecorder created, mimeType:", mr.mimeType, "state:", mr.state);
      chunksRef.current = [];
      cancelledRef.current = false;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const wasCancelled = cancelledRef.current;
        cleanup();
        if (wasCancelled || chunksRef.current.length === 0) return;
        const type = mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type });
        setSending(true);
        try {
          await onSend(file);
        } finally {
          setSending(false);
        }
      };

      mr.start();
      console.log("[VoiceRecorder] recording started, state:", mr.state);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      console.error("[VoiceRecorder] MediaRecorder start failed:", { name: err?.name, message: err?.message, err });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      alert(`Gagal memulai rekaman${err?.name ? ` (${err.name})` : ""}. Coba refresh halaman.`);
    }
  };

  const stopAndSend = () => {
    cancelledRef.current = false;
    mediaRecorderRef.current?.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    mediaRecorderRef.current?.stop();
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (sending) {
    return (
      <button type="button" disabled className="p-2.5 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </button>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={cancel} title="Batal" className="p-2 text-muted-foreground hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-500">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {fmt(seconds)}
        </span>
        <button type="button" onClick={stopAndSend} title="Kirim voice note" className="p-2 text-primary hover:scale-110 transition-transform">
          <Send className="w-4 h-4" />
        </button>
        <button type="button" onClick={stopAndSend} title="Stop" className="p-1 text-muted-foreground hover:text-foreground">
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      title="Rekam voice note"
      className={cn("p-2.5 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50", className)}
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
