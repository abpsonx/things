"use client";

export default function TypingIndicator({ names }: { names: string[] }) {
  if (!names || names.length === 0) return null;

  let text: string;
  if (names.length === 1) text = `${names[0]} sedang mengetik`;
  else if (names.length === 2) text = `${names[0]} dan ${names[1]} sedang mengetik`;
  else text = `${names.length} orang sedang mengetik`;

  return (
    <div className="flex items-center gap-2 px-3 pb-1.5 text-xs text-muted-foreground animate-in fade-in">
      <span className="flex items-end gap-0.5">
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" />
      </span>
      <span className="italic">{text}…</span>
    </div>
  );
}
