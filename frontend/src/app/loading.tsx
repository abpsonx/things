export default function Loading() {
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background gap-6">
      <div className="relative">
        <img
          src="/assets/logo.png"
          alt="Things"
          className="w-16 h-16 rounded-2xl object-contain animate-pulse"
        />
        <div className="absolute -inset-3 rounded-3xl border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
      <p className="text-xs font-medium text-muted-foreground tracking-wide">
        Memuat Things…
      </p>
    </div>
  );
}
