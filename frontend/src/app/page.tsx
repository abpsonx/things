import Link from "next/link";
import { ArrowRight, Layout, CheckCircle, MessageSquare, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Navbar */}
      <nav className="flex items-center justify-between p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tighter">
          <img src="/assets/logo.png" alt="Things Logo" className="w-8 h-8 object-contain" />
          <span>Things</span>
        </div>
        <div className="flex items-center gap-6">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium hover:text-muted-foreground transition-colors">
            Masuk
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-all"
          >
            Mulai Sekarang
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-8 py-24 text-center space-y-8">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
          Manajemen Proyek,<br/>Lebih Baik Bersama <span className="text-primary">Things</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10">
          Sederhanakan alur kerja tim kamu dengan papan kanban, diskusi real-time, dan manajemen tugas yang bersih. Terinspirasi dari cara kerja terbaik.
        </p>
        <div className="flex items-center justify-center gap-4 pt-4">
          <Link
            href="/register"
            className="px-8 py-4 bg-primary text-primary-foreground text-lg font-medium rounded-full hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            Daftar Gratis <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 bg-secondary text-secondary-foreground text-lg font-medium rounded-full border border-border hover:bg-accent transition-all"
          >
            Lihat Demo
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-4 gap-8 pt-24 text-left">
          {[
            { icon: Layout, title: "Papan Kanban", desc: "Visualisasikan tugas kamu dengan drag & drop yang mulus." },
            { icon: CheckCircle, title: "Manajemen Tugas", desc: "Sub-task, label, dan prioritas untuk setiap detail." },
            { icon: MessageSquare, title: "Diskusi Tim", desc: "Berkomunikasi langsung di konteks tugas yang dikerjakan." },
            { icon: Bell, title: "Notifikasi Pintar", desc: "Selalu update dengan apa yang terjadi di tim kamu." },
          ].map((feature, i) => (
            <div key={i} className="space-y-4 p-6 border border-border rounded-2xl bg-secondary/50">
              <div className="w-10 h-10 bg-primary/5 border border-border rounded-lg flex items-center justify-center">
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-32 py-12 text-center">
        <p className="text-sm text-muted-foreground">© 2026 Things. Built for speed and focus.</p>
        <div className="flex justify-center gap-6 text-sm text-muted-foreground mt-4">
          <a href="#" className="hover:text-primary transition-colors">Privacy</a>
          <a href="#" className="hover:text-primary transition-colors">Terms</a>
          <a href="#" className="hover:text-primary transition-colors">Twitter</a>
        </div>
      </footer>
    </div>
  );
}
