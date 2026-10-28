import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Layers, MoreHorizontal, Pencil, Save, Trash2, Ungroup, Star, Tag, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { db } from "@/lib/ov/db";
import { ensureTag, normalizeTagName, recordRecent, toggleFavorite } from "@/lib/ov/repo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CARD_TYPES } from "@/lib/ov/cards";
import type { Card, LeafCard } from "@/lib/ov/types";
import { RichTextBody } from "./RichTextCard";
import { ChecklistBody, ChoiceBody, FileBody, ImageBody, LinkBody, VaultRefBody } from "./CardBodies";
import type { Tag as TagRecord } from "@/lib/ov/types";

export function LeafBody({ card, editing, onChange, onFinishEditing }: { card: LeafCard; editing: boolean; onChange: (c: LeafCard) => void; onFinishEditing?: (() => void) | undefined }) {
  switch (card.type) {
    case "richtext": return <RichTextBody doc={card.doc} editing={editing} onChange={(doc) => onChange({ ...card, doc })} />;
    case "checklist": return <ChecklistBody card={card} editing={editing} onChange={onChange} />;
    case "radio":
    case "dropdown": return <ChoiceBody card={card} editing={editing} onChange={onChange} />;
    case "image": return <ImageBody card={card} editing={editing} onChange={onChange} />;
    case "file": return <FileBody card={card} editing={editing} onChange={onChange} />;
    case "link": return <LinkBody card={card} editing={editing} onChange={onChange} />;
    case "vaultref": return <VaultRefBody card={card} editing={editing} onChange={onChange} onFinishEditing={onFinishEditing} />;
  }
}

const typeLabel = (t: Card["type"]) => (t === "composite" ? "Stitched" : CARD_TYPES.find((c) => c.type === t)?.label ?? t);

function CardTags({ card, editing, onChange }: { card: Card; editing: boolean; onChange: (card: Card) => void }) {
  const [value, setValue] = useState("");
  const tags = useLiveQuery(() => db.tags.orderBy("name").toArray(), []) ?? [];
  const assigned = card.tags ?? [];
  async function add(name: string) {
    const cleaned = normalizeTagName(name);
    if (!cleaned || assigned.some((tag) => tag.toLowerCase() === cleaned.toLowerCase())) return;
    try {
      const ensured = await Promise.all([...assigned, cleaned].map((label) => ensureTag(label)));
      onChange({ ...card, tags: ensured.map((tag) => tag.name), tagIds: ensured.map((tag) => tag.id) });
      setValue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign tag.");
    }
  }
  async function remove(name: string) {
    try {
      const normalized = name.toLowerCase();
      const retained = assigned.filter((tag) => tag.toLowerCase() !== normalized);
      const ensured = await Promise.all(retained.map((label) => ensureTag(label)));
      onChange({ ...card, tags: ensured.map((tag) => tag.name), tagIds: ensured.map((tag) => tag.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove tag.");
    }
  }
  const matches = tags.filter((tag: TagRecord) => tag.name.toLowerCase().includes(value.trim().toLowerCase()) && !assigned.some((name) => name.toLowerCase() === tag.normalized));
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {assigned.map((name, index) => {
        const tag = tags.find((item: TagRecord) => item.id === card.tagIds?.[index]) ?? tags.find((item: TagRecord) => item.normalized === normalizeTagName(name).toLowerCase());
        return editing ? <span key={name.toLowerCase()} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">#{name}<button type="button" onClick={() => void remove(name)} aria-label={`Remove tag ${name}`} className="rounded-full hover:text-destructive"><X className="size-3" /></button></span> : <button key={name.toLowerCase()} type="button" disabled={!tag} onClick={() => tag && window.dispatchEvent(new CustomEvent("ov-open-tag", { detail: { tagId: tag.id } }))} aria-label={`Browse cards tagged ${name}`} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-accent disabled:cursor-default">#{name}</button>;
      })}
      {editing && <div className="relative min-w-32 flex-1">
        <div className="flex items-center gap-1"><Tag className="size-3.5 text-muted-foreground" /><Input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(value); } }} placeholder="Add tag and press Enter" aria-label="Tags" className="h-7 min-w-32 border-transparent px-1 text-xs shadow-none focus-visible:border-input" /></div>
        {!!value.trim() && <div className="absolute left-0 top-full z-20 mt-1 max-h-36 w-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">{matches.map((tag: TagRecord) => <button key={tag.id} type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent" onClick={() => void add(tag.name)}>{tag.name}</button>)}{!matches.some((tag: TagRecord) => tag.normalized === value.trim().toLowerCase()) && <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs text-primary hover:bg-accent" onClick={() => void add(value)}>Create “{normalizeTagName(value)}”</button>}</div>}
      </div>}
    </div>
  );
}

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

export function CardView({ card, index, count, selecting, selected, onSelect, actions, highlighted, startEditing = false }: {
  card: Card; index: number; count: number; selecting: boolean; selected: boolean; onSelect: (v: boolean) => void; actions: CardActions; highlighted?: boolean; startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [tagsOpen, setTagsOpen] = useState(false);
  const favorite = useLiveQuery(() => db.references.get(`favorite:card:${card.id}`), [card.id]);
  return (
    <article id={`card-${card.id}`} tabIndex={-1} onClick={(event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button,input,textarea,select,[role=combobox],[contenteditable=true]")) return;
      recordRecent("card", card.id).catch(() => toast.error("Could not update recent history"));
    }} className={`group border-b border-border py-5 last:border-b-0 ${highlighted ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : ""}`} aria-label={card.title || "Card"}>
      <header className="mb-2 flex items-start gap-2">
        {selecting && (
          <Checkbox className="mt-1.5" checked={selected} onCheckedChange={(v) => onSelect(!!v)} aria-label={`Select ${card.title}`} disabled={card.type === "composite"} />
        )}
        <div className="min-w-0 flex-1">
          <EditableTitle title={card.title} editing={editing && card.type !== "vaultref"} onChange={(title) => actions.onChange({ ...card, title })} />
          <span className="text-xs text-muted-foreground">{typeLabel(card.type)}</span>
          {!!card.tags?.length && !editing && <CardTags card={card} editing={false} onChange={actions.onChange} />}
          {editing && card.type !== "vaultref" && <CardTags card={card} editing onChange={actions.onChange} />}
        </div>
        <Button size="icon" variant="ghost" className="size-8" aria-label={`${favorite ? "Unfavorite" : "Favorite"} card`} title={`${favorite ? "Unfavorite" : "Favorite"} card`} aria-pressed={!!favorite} onClick={() => toggleFavorite("card", card.id).catch(() => toast.error("Could not save favorite"))}><Star className={`size-4 ${favorite ? "fill-current text-primary" : ""}`} /></Button>
        {editing && card.type !== "vaultref" ? (
          <Button size="sm" onClick={() => setEditing(false)}><Check className="size-4" />Done</Button>
        ) : !editing ? (
          <Button size="icon" variant="ghost" className="size-8 opacity-60 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditing(true)} aria-label="Edit card"><Pencil className="size-4" /></Button>
        ) : null}
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
            <DropdownMenuItem onSelect={() => setTagsOpen(true)}><Tag />Edit tags</DropdownMenuItem>
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
            <div key={ch.id} id={`card-${ch.id}`} tabIndex={-1} className="space-y-1.5 focus-visible:ring-2 focus-visible:ring-primary">
              <EditableTitle size="sm" title={ch.title} editing={editing} onChange={(title) => actions.onChange({ ...card, children: card.children.map((x) => (x.id === ch.id ? { ...x, title } : x)) })} />
              {!!ch.tags?.length && !editing && <CardTags card={ch} editing={false} onChange={(next) => next.type !== "composite" && actions.onChange({ ...card, children: card.children.map((x) => (x.id === next.id ? next : x)) })} />}
              {editing && ch.type !== "vaultref" && <CardTags card={ch} editing onChange={(next) => next.type !== "composite" && actions.onChange({ ...card, children: card.children.map((x) => (x.id === next.id ? next : x)) })} />}
              <LeafBody card={ch} editing={editing} onChange={(n) => actions.onChange({ ...card, children: card.children.map((x) => (x.id === n.id ? n : x)) })} />
            </div>
          ))}
        </div>
      ) : (
        <LeafBody card={card} editing={editing} onChange={actions.onChange} onFinishEditing={() => setEditing(false)} />
      )}
      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>Tags for {card.title}</DialogTitle></DialogHeader><CardTags card={card} editing onChange={actions.onChange} /></DialogContent></Dialog>
    </article>
  );
}
