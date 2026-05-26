export interface MentionMember {
  id: string;
  name: string;
  avatar_url?: string | null;
}

/**
 * Suggestion config for the Tiptap Mention extension. Renders a small
 * theme-aware dropdown (no tippy dependency) and reads the member list
 * lazily via `getMembers` so it always sees the latest fetched members.
 */
export function createMentionSuggestion(getMembers: () => MentionMember[]) {
  return {
    char: "@",
    items: ({ query }: { query: string }) => {
      const q = (query || "").toLowerCase();
      return getMembers()
        .filter((m) => m.name.toLowerCase().includes(q))
        .slice(0, 6);
    },
    // Tiptap v3's `Mention.configure({ suggestion })` REPLACES the default
    // suggestion object, so the built-in command that inserts the node is
    // gone — we must provide our own or nothing gets inserted on select.
    command: ({ editor, range, props }: any) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: "mention", attrs: { id: props.id, label: props.label } },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: () => {
      let el: HTMLDivElement | null = null;
      let items: MentionMember[] = [];
      let selectedIndex = 0;
      let command: ((item: { id: string; label: string }) => void) | null = null;

      const select = (i: number) => {
        const item = items[i];
        if (item && command) command({ id: item.id, label: item.name });
      };

      const paint = () => {
        if (!el) return;
        if (items.length === 0) {
          el.style.display = "none";
          return;
        }
        el.style.display = "block";
        el.innerHTML = "";
        items.forEach((m, i) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "mention-item" + (i === selectedIndex ? " is-selected" : "");
          btn.textContent = m.name;
          btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            select(i);
          });
          btn.addEventListener("mouseenter", () => {
            selectedIndex = i;
            paint();
          });
          el!.appendChild(btn);
        });
      };

      const position = (rect: DOMRect | null | undefined) => {
        if (!el || !rect) return;
        const margin = 6;
        // Open downward unless there isn't room.
        const below = rect.bottom + margin;
        const wouldOverflow = below + 240 > window.innerHeight;
        el.style.left = `${Math.round(rect.left)}px`;
        if (wouldOverflow) {
          el.style.top = "";
          el.style.bottom = `${Math.round(window.innerHeight - rect.top + margin)}px`;
        } else {
          el.style.bottom = "";
          el.style.top = `${Math.round(below)}px`;
        }
      };

      return {
        onStart: (props: any) => {
          items = props.items || [];
          selectedIndex = 0;
          command = props.command;
          el = document.createElement("div");
          el.className = "mention-dropdown";
          document.body.appendChild(el);
          paint();
          position(props.clientRect?.());
        },
        onUpdate: (props: any) => {
          items = props.items || [];
          selectedIndex = 0;
          command = props.command;
          paint();
          position(props.clientRect?.());
        },
        onKeyDown: (props: any) => {
          const key = props.event.key;
          if (items.length === 0) return false;
          if (key === "ArrowDown") {
            selectedIndex = (selectedIndex + 1) % items.length;
            paint();
            return true;
          }
          if (key === "ArrowUp") {
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            paint();
            return true;
          }
          if (key === "Enter" || key === "Tab") {
            select(selectedIndex);
            return true;
          }
          if (key === "Escape") {
            el?.remove();
            el = null;
            return true;
          }
          return false;
        },
        onExit: () => {
          el?.remove();
          el = null;
        },
      };
    },
  };
}

/** Pull the mentioned member ids out of saved editor HTML (mention nodes carry data-id). */
export function extractMentionIds(html: string): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  const re = /data-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return Array.from(ids);
}
