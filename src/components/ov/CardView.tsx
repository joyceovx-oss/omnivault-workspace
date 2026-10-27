import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Layers, MoreHorizontal, Pencil, Save, Trash2, Ungroup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CARD_TYPES } from "@/lib/ov/cards";
import type { Card, LeafCard } from "@/lib/ov/types";
import { RichTextBody } from "./RichTextCard";
import { ChecklistBody, ChoiceBody, FileBody, ImageBody, LinkBody, VaultRefBody } from "./CardBodies";

export function LeafBody({ card, editing, onChange }: { card: LeafCard; editing: boolean; onChange: (c: LeafCard) => void }) {
  switch (card.type) {
    case "richtext": return <RichTextBody doc={card.doc} editing={editing} onChange={(doc) => onChange({ ...card, doc })} />;
    case "checklist": return <ChecklistBody card={card} editing={editing} onChange={onChange} />;
    case "radio":
    case "dropdown": return <ChoiceBody card={card} editing={editing} onChange={onChange} />;
    case "image": return <ImageBody card={card} editing={editing} onChange={onChange} />;
    case "file": return <FileBody card={card} editing={editing} onChange={onChange} />;
    case "link": return <LinkBody card={card} editing={editing} onChange={onChange} />;
    case "vaultref": return <VaultRefBody card={card} editing={editing} onChange={onChange} />;
  }
}

const typeLabel = (t: Card["type"]) => (t === "composite" ? "Stitched" : CARD_TYPES.find((c) => c.type === t)!.label);

function EditableTitle({ title, editing, onChange, size = "base" }: { title: string; editing: boolean; onChange: (t: string) => void; size?: "base" | "sm" }) {
  if (editing) return <Input value={title} onChange={(e) => onChange(e.target.value)} aria-label="Card title" className="h-8 max-w-md font-medium" />;
  return <h3 className={size === "sm" ? "text-sm font-medium" : "font-semibold"}>{title || "Untitled"}</h3>;
}

export interface CardActions {
  onChange: (c: Card) => void;
  onDuplicate: () => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onSaveTemplate: () => void;
  onUngroup: () => void;
}

export function CardView({ card, index, count, selecting, selected, onSelect, actions }: {
  card: Card; index: number; count: number; selecting: boolean; selected: boolean; onSelect: (v: boolean) => void; actions: CardActions;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <article className="group border-b border-border py-5 last:border-b-0" aria-label={card.title || "Card"}>
      <header className="mb-2 flex items-start gap-2">
        {selecting && (
          <Checkbox className="mt-1.5" checked={selected} onCheckedChange={(v) => onSelect(!!v)} aria-label={`Select ${card.title}`} disabled={card.type === "composite"} />
        )}
        <div className="min-w-0 flex-1">
          <EditableTitle title={card.title} editing={editing} onChange={(title) => actions.onChange({ ...card, title })} />
          <span className="text-xs text-muted-foreground">{typeLabel(card.type)}</span>
        </div>
        {editing ? (
          <Button size="sm" onClick={() => setEditing(false)}><Check className="size-4" />Done</Button>
        ) : (
          <Button size="icon" variant="ghost" className="size-8 opacity-60 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditing(true)} aria-label="Edit card"><Pencil className="size-4" /></Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Card actions"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil />Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.onDuplicate}><Copy />Duplicate</DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => actions.onMove(-1)}><ArrowUp />Move up</DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.onMove(1)}><ArrowDown />Move down</DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.onSaveTemplate}><Save />Save as template</DropdownMenuItem>
            {card.type === "composite" && <DropdownMenuItem onSelect={actions.onUngroup}><Ungroup />Ungroup</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={actions.onDelete}><Trash2 />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {card.type === "composite" ? (
        <div className="space-y-4 border-l-2 border-accent pl-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Layers className="size-3.5" />{card.children.length} stitched cards</p>
          {card.children.map((ch) => (
            <div key={ch.id} className="space-y-1.5">
              <EditableTitle size="sm" title={ch.title} editing={editing} onChange={(title) => actions.onChange({ ...card, children: card.children.map((x) => (x.id === ch.id ? { ...x, title } : x)) })} />
              <LeafBody card={ch} editing={editing} onChange={(n) => actions.onChange({ ...card, children: card.children.map((x) => (x.id === n.id ? n : x)) })} />
            </div>
          ))}
        </div>
      ) : (
        <LeafBody card={card} editing={editing} onChange={actions.onChange} />
      )}
    </article>
  );
}
