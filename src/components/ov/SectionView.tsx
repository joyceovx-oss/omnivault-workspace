import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Combine, LayoutTemplate, Plus, Trash2, X, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { db } from "@/lib/ov/db";
import { CARD_TYPES, move, newCard, stitch, ungroup } from "@/lib/ov/cards";
import { deleteTemplate, duplicateCard, insertCardTemplate, mutateCards, saveCardTemplate, updateCard, updateSection, deleteCard, toggleFavorite } from "@/lib/ov/repo";
import type { Section, Template } from "@/lib/ov/types";
import { CardView } from "./CardView";
import { useDialogs } from "./dialogs";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong.");

export function SectionView({ section, focusCard }: { section: Section; focusCard?: string | null }) {
  const { prompt, confirm } = useDialogs();
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState(section.title);
  const [desc, setDesc] = useState(section.description);
  const [newCardId, setNewCardId] = useState<string | null>(null);
  useEffect(() => { setTitle(section.title); setDesc(section.description); setSel([]); setSelecting(false); }, [section.id]);
  const cardTemplates = useLiveQuery(() => db.templates.where("level").equals("card").toArray(), []) as Extract<Template, { level: "card" }>[] | undefined;
  const id = section.id;
  const [tag, setTag] = useState("all");
  const tags = [...new Set(section.cards.flatMap((c) => c.tags ?? []))].sort();
  const favorites = useLiveQuery(() => db.references.where("kind").equals("favorite").toArray(), []) ?? [];

  async function doStitch() {
    try {
      const name = await prompt({ title: "Stitch cards", label: "Component name", initial: "Stitched component", confirm: "Stitch" });
      if (!name) return;
      await mutateCards(id, (cards) => stitch(cards, sel, name));
      setSel([]); setSelecting(false);
      toast.success("Cards stitched");
    } catch (e) { err(e); }
  }
  async function addCard(type: (typeof CARD_TYPES)[number]["type"]) {
    const card = newCard(type);
    try {
      await mutateCards(id, (cards) => [...cards, card]);
      setNewCardId(card.id);
    } catch (e) { err(e); }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== section.title ? updateSection(id, { title: title.trim() }).catch(err) : setTitle(section.title)}
        aria-label="Section title"
        className="h-auto border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:border-input md:text-3xl"
      />
      <Textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => desc !== section.description && updateSection(id, { description: desc }).catch(err)}
        placeholder="Add a description…"
        aria-label="Section description"
        className="mt-1 min-h-0 resize-none border-transparent bg-transparent px-0 text-muted-foreground shadow-none focus-visible:border-input"
        rows={1}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label={`${favorites.some((f) => f.targetId === id) ? "Unfavorite" : "Favorite"} section`} title={`${favorites.some((f) => f.targetId === id) ? "Unfavorite" : "Favorite"} section`} aria-pressed={favorites.some((f) => f.targetId === id)} onClick={() => toggleFavorite("section", id).catch(err)}><Star className={`size-4 ${favorites.some((f) => f.targetId === id) ? "fill-current text-primary" : ""}`} /></Button>
        {tags.length > 0 && <label className="text-sm text-muted-foreground">Tag <select aria-label="Filter cards by tag" className="max-w-32 rounded border border-input bg-background px-2 py-1 text-foreground" value={tag} onChange={(e) => setTag(e.target.value)}><option value="all">All tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select></label>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm"><Plus className="size-4" />Add card<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CARD_TYPES.map((t) => (
              <DropdownMenuItem key={t.type} onSelect={() => void addCard(t.type)}>{t.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="secondary"><LayoutTemplate className="size-4" />Templates<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Card templates</DropdownMenuLabel>
            {!cardTemplates?.length && <p className="px-2 py-1.5 text-sm text-muted-foreground">No card templates yet. Use a card's "Save as template" action.</p>}
            {cardTemplates?.map((t) => (
              <div key={t.id} className="flex items-center">
                <DropdownMenuItem className="flex-1" onSelect={() => insertCardTemplate(id, t).then(() => toast.success(`Inserted "${t.name}"`)).catch(err)}>{t.name}</DropdownMenuItem>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete template ${t.name}`} onClick={async () => { if (await confirm({ title: "Delete template?", body: `"${t.name}" will be removed. Cards already inserted stay.`, destructive: true, confirm: "Delete" })) deleteTemplate(t.id).catch(err); }}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {section.cards.length > 1 && (
          selecting ? (
            <>
              <Button size="sm" variant="secondary" disabled={sel.length < 2} onClick={doStitch}><Combine className="size-4" />Stitch {sel.length || ""}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelecting(false); setSel([]); }}><X className="size-4" />Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setSelecting(true)}><Combine className="size-4" />Select to stitch</Button>
          )
        )}
      </div>

      <div className="mt-2">
        {section.cards.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">This section is empty. Add a card to begin.</p>}
        {section.cards.map((card, i) => tag !== "all" && !card.tags?.includes(tag) && card.id !== focusCard ? null : (
          <CardView
            key={card.id}
            card={card}
            highlighted={focusCard === card.id}
            startEditing={card.id === newCardId}
            index={i}
            count={section.cards.length}
            selecting={selecting}
            selected={sel.includes(card.id)}
            onSelect={(v) => setSel((s) => (v ? [...s, card.id] : s.filter((x) => x !== card.id)))}
            actions={{
              onChange: (c) => updateCard(id, c).catch(err),
              onDuplicate: () => duplicateCard(id, card).catch(err),
              onMove: (d) => mutateCards(id, (cs) => move(cs, cs.findIndex((x) => x.id === card.id), d)).catch(err),
              onDelete: async () => {
                if (await confirm({ title: "Move card to Trash?", body: `"${card.title || "Untitled"}" can be restored from Trash.`, destructive: true, confirm: "Move to Trash" }))
                  deleteCard(id, card.id).catch(err);
              },
              onSaveTemplate: async () => {
                const name = await prompt({ title: "Save card template", label: "Template name", initial: card.title });
                if (name) saveCardTemplate(name, card).then(() => toast.success("Template saved")).catch(err);
              },
              onUngroup: () => mutateCards(id, (cs) => ungroup(cs, card.id)).then(() => toast.success("Ungrouped")).catch(err),
            }}
          />
        ))}
      </div>
    </div>
  );
}
