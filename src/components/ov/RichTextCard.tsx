import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import {
  Bold, Italic, Underline, Heading1, Heading2, Heading3, Pilcrow, Quote, Highlighter,
  List, ListOrdered, Link2, RemoveFormatting,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { safeUrl, sanitizeDoc } from "@/lib/ov/url";
import type { RichDoc } from "@/lib/ov/types";
import { useDialogs } from "./dialogs";
import { toast } from "sonner";

const extensions = [
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto"],
      isAllowedUri: (url) => safeUrl(url) !== null,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
  Highlight,
];

export function RichTextBody({
  doc,
  editing,
  onChange,
}: {
  doc: RichDoc;
  editing: boolean;
  onChange: (d: RichDoc) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<RichDoc | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions,
    content: sanitizeDoc(doc) as RichDoc,
    editable: editing,
    immediatelyRender: false,
    editorProps: { attributes: { class: "ov-prose min-h-[2rem]", "aria-label": "Card content" } },
    onUpdate: ({ editor }) => {
      latest.current = editor.getJSON() as RichDoc;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
  });

  function flush() {
    clearTimeout(timer.current);
    if (latest.current) {
      onChangeRef.current(latest.current);
      latest.current = null;
    }
  }

  useEffect(() => {
    editor?.setEditable(editing);
    if (!editing) flush();
  }, [editing, editor]);
  // Save pending edits when the card unmounts (e.g. switching section).
  useEffect(() => () => flush(), []);

  const empty = !editing && (!doc.content || doc.content.length === 0);
  return (
    <div>
      {editing && editor && <Toolbar editor={editor} />}
      {empty ? (
        <p className="text-sm text-muted-foreground">Empty — use edit to add content.</p>
      ) : (
        <EditorContent editor={editor} className={editing ? "rounded-md border border-input bg-background px-3 py-2" : ""} />
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { prompt } = useDialogs();
  const c = () => editor.chain().focus();
  const items: [string, typeof Bold, () => void, boolean][] = [
    ["Bold", Bold, () => c().toggleBold().run(), editor.isActive("bold")],
    ["Italic", Italic, () => c().toggleItalic().run(), editor.isActive("italic")],
    ["Underline", Underline, () => c().toggleUnderline().run(), editor.isActive("underline")],
    ["Heading 1", Heading1, () => c().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 })],
    ["Heading 2", Heading2, () => c().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 })],
    ["Heading 3", Heading3, () => c().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 })],
    ["Paragraph", Pilcrow, () => c().setParagraph().run(), editor.isActive("paragraph")],
    ["Quote", Quote, () => c().toggleBlockquote().run(), editor.isActive("blockquote")],
    ["Highlight", Highlighter, () => c().toggleHighlight().run(), editor.isActive("highlight")],
    ["Bulleted list", List, () => c().toggleBulletList().run(), editor.isActive("bulletList")],
    ["Numbered list", ListOrdered, () => c().toggleOrderedList().run(), editor.isActive("orderedList")],
    [
      "Link",
      Link2,
      async () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const v = await prompt({ title: "Link", label: "URL (leave the current link to keep it)", initial: prev ?? "https://" });
        if (v === null) return;
        const url = safeUrl(v);
        if (!url) return toast.error("That link isn't a safe web address.");
        c().extendMarkRange("link").setLink({ href: url }).run();
      },
      editor.isActive("link"),
    ],
    ["Clear formatting", RemoveFormatting, () => c().unsetAllMarks().clearNodes().run(), false],
  ];
  return (
    <div role="toolbar" aria-label="Formatting" className="mb-2 flex flex-wrap gap-0.5">
      {items.map(([label, Icon, run, active]) => (
        <Toggle key={label} size="sm" pressed={active} onPressedChange={() => run()} aria-label={label} title={label}>
          <Icon className="size-4" />
        </Toggle>
      ))}
    </div>
  );
}
