"use client";

import { useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import { createMentionSuggestion, MentionMember } from './mentionSuggestion';
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2,
  List, ListOrdered, CheckSquare, Quote, Undo, Redo, Link as LinkIcon
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  /** When provided, typing "@" opens a member picker to tag people. */
  members?: MentionMember[];
}

export function RichTextEditor({ content, onChange, placeholder = "Mulai menulis...", readOnly = false, members }: RichTextEditorProps) {
  // Keep the latest members in a ref so the (once-created) suggestion closure
  // always sees freshly fetched members.
  const membersRef = useRef<MentionMember[]>(members || []);
  membersRef.current = members || [];

  const editor = useEditor({
    extensions: [
      // StarterKit v3 bundles its own Link — disable it so our explicit
      // Link.configure below is the only one (avoids the duplicate-extension warning).
      StarterKit.configure({ link: false } as any),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: createMentionSuggestion(() => membersRef.current),
      }),
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px]',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) {
    return null;
  }

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div 
      className={`flex flex-col border border-border rounded-xl overflow-hidden bg-card ${readOnly ? 'border-none' : ''}`}
    >
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-secondary/50">
          <MenuButton 
            onClick={() => editor.chain().focus().toggleBold().run()} 
            isActive={editor.isActive('bold')} icon={<Bold className="w-4 h-4" />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleItalic().run()} 
            isActive={editor.isActive('italic')} icon={<Italic className="w-4 h-4" />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleStrike().run()} 
            isActive={editor.isActive('strike')} icon={<Strikethrough className="w-4 h-4" />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleCode().run()} 
            isActive={editor.isActive('code')} icon={<Code className="w-4 h-4" />} 
          />
          <div className="w-px h-4 bg-border mx-1" />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
            isActive={editor.isActive('heading', { level: 1 })} icon={<Heading1 className="w-4 h-4" />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
            isActive={editor.isActive('heading', { level: 2 })} icon={<Heading2 className="w-4 h-4" />} 
          />
          <div className="w-px h-4 bg-border mx-1" />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleBulletList().run()} 
            isActive={editor.isActive('bulletList')} icon={<List className="w-4 h-4" />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleOrderedList().run()} 
            isActive={editor.isActive('orderedList')} icon={<ListOrdered className="w-4 h-4" />} 
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleTaskList().run()} 
            isActive={editor.isActive('taskList')} icon={<CheckSquare className="w-4 h-4" />} 
          />
          <div className="w-px h-4 bg-border mx-1" />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleBlockquote().run()} 
            isActive={editor.isActive('blockquote')} icon={<Quote className="w-4 h-4" />} 
          />
          <MenuButton 
            onClick={toggleLink} 
            isActive={editor.isActive('link')} icon={<LinkIcon className="w-4 h-4" />} 
          />
          <div className="flex-1" />
          <MenuButton 
            onClick={() => editor.chain().focus().undo().run()} 
            isActive={false} icon={<Undo className="w-4 h-4" />} disabled={!editor.can().undo()}
          />
          <MenuButton 
            onClick={() => editor.chain().focus().redo().run()} 
            isActive={false} icon={<Redo className="w-4 h-4" />} disabled={!editor.can().redo()}
          />
        </div>
      )}
      
      <div 
        className={readOnly ? '' : 'p-4 cursor-text'} 
        onClick={() => { if (!readOnly) editor.commands.focus() }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function MenuButton({ onClick, isActive, icon, disabled = false }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors ${
        isActive 
          ? 'bg-primary/20 text-primary' 
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {icon}
    </button>
  );
}
