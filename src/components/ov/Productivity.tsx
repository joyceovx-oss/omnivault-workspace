import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Clock, Inbox, Plus, Search, Star, Tag, Trash2, Undo2, ArrowRight, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/ov/db";
import { searchIndex, filterSearch, resolveReferences, type SearchResult } from "@/lib/ov/search";
import { clearRecentHistory, createProject, createSection, deleteTag, deleteCapture, ensureTag, moveCapture, permanentlyDelete, renameTag, restoreTrash, saveCapture, toggleFavorite, insertCardTemplate } from "@/lib/ov/repo";
import type { Tag as TagRecord } from "@/lib/ov/types";
import { useDialogs } from "./dialogs";

export type UtilityView = "inbox" | "trash" | "favorite" | "recent" | "tags";
export const utilityItems = [{ id: "inbox", label: "Inbox", Icon: Inbox }, { id: "favorite", label: "Favorites", Icon: Star }, { id: "recent", label: "Recent items", Icon: Clock }, { id: "tags", label: "Tags", Icon: Tag }, { id: "trash", label: "Trash", Icon: Trash2 }] as const;
const error = (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save changes.");
export function UtilityNav({ collapsed, view, onOpen }: { collapsed: boolean; view: UtilityView | null; onOpen: (v: UtilityView) => void }) {
  return <div className="mt-auto space-y-1 border-t border-sidebar-border pt-3">{utilityItems.map(({ id, label, Icon }) => <Button key={id} variant={view === id ? "secondary" : "ghost"} size={collapsed ? "icon" : "sm"} className={collapsed ? "size-8" : "w-full justify-start"} aria-label={label} title={label} onClick={() => onOpen(id)}><Icon className="size-4" />{!collapsed && label}</Button>)}</div>;
}
function Filter({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { id: string; label: string }[] }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="min-w-0 flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All {label.toLowerCase()}</SelectItem>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
export function SearchDialog({ open, onOpenChange, onNavigate, onOpenTag, projectId, sectionId }: { open: boolean; onOpenChange: (v: boolean) => void; onNavigate: (r: SearchResult) => void; onOpenTag: (tagId: string) => void; projectId: string | null; sectionId: string | undefined }) {
  const [query, setQuery] = useState(""), [project, setProject] = useState("all"), [type, setType] = useState("all"), [tag, setTag] = useState("all");
  const data = useLiveQuery(async () => {
    const [projects, sections, templates, tags] = await Promise.all([db.projects.toArray(), db.sections.toArray(), db.templates.toArray(), db.tags.toArray()]);
    return { projects, templates, tags, rows: searchIndex(projects, sections, templates) };
  }, []);
  const rows = filterSearch(data?.rows ?? [], query, project, type, tag);
  const tagMatches = (data?.tags ?? []).filter((item) => query.trim() && item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const tags = [...new Set(data?.rows.flatMap((r) => r.tags))].sort();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const template = data?.templates.find((t) => t.id === templateId);
  async function insert() {
    if (!template) return;
    try {
      if (template.level === "card") { if (!sectionId) return; await insertCardTemplate(sectionId, template); }
      else if (template.level === "section") { if (!projectId) return; const sid = await createSection(projectId, template.section); onNavigate({ id: sid, title: template.name, type: "section", location: "", text: "", tags: [], projectId, sectionId: sid }); }
      else { const p = await createProject(template.name, template.category, template.sections); onNavigate({ id: p.projectId, title: template.name, type: "project", location: "", text: "", tags: [], projectId: p.projectId, sectionId: p.sectionId }); }
      setTemplateId(null); onOpenChange(false); toast.success("Template inserted");
    } catch (e) { error(e); }
  }
  return <><Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Search workspace</DialogTitle></DialogHeader><Command shouldFilter={false}><CommandInput aria-label="Search workspace" placeholder="Search notes, projects, templates…" value={query} onValueChange={setQuery} /><div className="flex flex-wrap gap-2 py-3"><Filter label="Projects" value={project} onChange={setProject} options={(data?.projects ?? []).map((p) => ({ id: p.id, label: p.name }))} /><Filter label="Types" value={type} onChange={setType} options={[...new Set(data?.rows.map((r) => r.type))].map((t) => ({ id: t, label: t }))} /><Filter label="Tags" value={tag} onChange={setTag} options={tags.map((t) => ({ id: t, label: t }))} /></div><CommandList><CommandEmpty>No matching items.</CommandEmpty>{tagMatches.map((item) => <CommandItem key={`tag:${item.id}`} value={`tag:${item.id}`} onSelect={() => { onOpenTag(item.id); onOpenChange(false); }}><Tag className="mt-1 size-4" /><div className="min-w-0"><p className="truncate font-medium">#{item.name}</p><p className="truncate text-xs text-muted-foreground">Tag · Browse associated cards</p></div></CommandItem>)}{rows.map((r) => <CommandItem key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`} onSelect={() => { if (r.templateId) setTemplateId(r.templateId); else onNavigate(r); onOpenChange(false); }}><Search className="mt-1 size-4" /><div className="min-w-0"><p className="truncate font-medium">{r.title || "Untitled"}</p><p className="truncate text-xs text-muted-foreground">{r.location}</p><p className="truncate text-xs text-muted-foreground">{r.text.slice(0, 140)}</p></div></CommandItem>)}</CommandList></Command></DialogContent></Dialog><Dialog open={!!template} onOpenChange={(v) => !v && setTemplateId(null)}><DialogContent><DialogHeader><DialogTitle>{template?.name}</DialogTitle><DialogDescription>{template?.level} template</DialogDescription></DialogHeader><p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{data?.rows.find((r) => r.id === templateId)?.text}</p><Button disabled={template?.level === "card" ? !sectionId : template?.level === "section" ? !projectId : false} onClick={insert}>Insert template</Button></DialogContent></Dialog></>;
}
export function CaptureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await saveCapture(text); setText(""); onOpenChange(false); toast.success("Saved to Inbox"); } catch (e) { error(e); } finally { setBusy(false); } }}><DialogHeader><DialogTitle>Quick capture</DialogTitle></DialogHeader><Textarea autoFocus aria-label="Capture note or link" placeholder="A note or link…" rows={5} value={text} onChange={(e) => setText(e.target.value)} /><Button disabled={!text.trim() || busy} type="submit"><Plus className="size-4" />Save to Inbox</Button></form></DialogContent></Dialog>;
}
export function UtilityPanel({ view, onNavigate, onCapture, selectedTagId }: { view: UtilityView; onNavigate: (r: SearchResult) => void; onCapture: () => void; selectedTagId: string | null }) {
  const { confirm } = useDialogs();
  const data = useLiveQuery(async () => {
    const [projects, sections, templates, inbox, trash, refs, tags] = await Promise.all([db.projects.toArray(), db.sections.toArray(), db.templates.toArray(), db.inbox.orderBy("createdAt").reverse().toArray(), db.trash.orderBy("deletedAt").reverse().toArray(), db.references.where("kind").equals(view).toArray(), db.tags.orderBy("name").toArray()]);
    return { projects, sections, inbox, trash, tags, rows: searchIndex(projects, sections, templates), links: resolveReferences(refs, searchIndex(projects, sections, templates)) };
  }, [view]);
  const [editing, setEditing] = useState<string | null>(null), [text, setText] = useState(""), [moving, setMoving] = useState<string | null>(null), [destination, setDestination] = useState("");
  const label = utilityItems.find((v) => v.id === view)?.label;
  return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8"><div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-semibold">{label}</h1>{view === "inbox" && <Button size="sm" onClick={onCapture}><Plus className="size-4" />Quick capture</Button>}{view === "recent" && <Button size="sm" variant="ghost" disabled={!data} onClick={() => clearRecentHistory().catch(error)}><X className="size-4" />Clear history</Button>}</div>
    {view === "inbox" && <>{data?.inbox.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Your Inbox is empty.</p>}{data?.inbox.map((item) => <article key={item.id} className="border-b border-border py-4"><p className="whitespace-pre-wrap break-words text-sm">{item.text}</p><div className="mt-2 flex gap-1"><Button size="sm" variant="ghost" aria-label="Edit capture" onClick={() => { setEditing(item.id); setText(item.text); }}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setMoving(item.id); setDestination(""); }}><ArrowRight className="size-4" />Move to section</Button><Button size="sm" variant="ghost" aria-label="Delete capture" onClick={async () => { if (await confirm({ title: "Delete capture?", body: "This note will be permanently removed.", destructive: true, confirm: "Delete" })) deleteCapture(item.id).catch(error); }}><Trash2 className="size-4" /></Button></div></article>)}</>}
    {view === "trash" && <>{data?.trash.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Trash is empty.</p>}{data?.trash.map((item) => { const title = item.type === "project" ? item.project.name : item.type === "section" ? item.section.title : item.card.title; return <article key={item.id} className="flex items-center gap-3 border-b border-border py-4"><div className="min-w-0 flex-1"><p className="truncate font-medium">{title}</p><p className="text-xs text-muted-foreground">{item.type} · {new Date(item.deletedAt).toLocaleDateString()}</p></div><Button size="sm" variant="ghost" onClick={() => restoreTrash(item.id).then(() => toast.success("Restored; missing parents use Recovered items")).catch(error)}><Undo2 className="size-4" />Restore</Button><Button size="icon" variant="ghost" aria-label={`Permanently delete ${title}`} onClick={async () => { if (await confirm({ title: "Permanently delete?", body: `“${title}” cannot be recovered after this.`, destructive: true, confirm: "Delete permanently" })) permanentlyDelete(item.id).then(() => toast.success("Permanently deleted")).catch(error); }}><Trash2 className="size-4" /></Button></article>; })}</>}
    {view === "tags" && <TagsPanel key={selectedTagId ?? "all"} tags={data?.tags ?? []} rows={data?.rows ?? []} onNavigate={onNavigate} selectedTagId={selectedTagId} />}
    {(view === "favorite" || view === "recent") && <>{data?.links.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{view === "favorite" ? "No favorites yet." : "No recent items."}</p>}{view === "favorite" ? (["project", "section", "card"] as const).map((type) => { const entries = data?.links.filter(({ ref }) => ref.type === type) ?? []; return entries.length ? <section key={type} className="mb-5"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{type === "card" ? "Cards" : `${type}s`}</h2>{entries.map(({ ref, row }) => <div key={ref.id} className="flex items-center border-b border-border py-2"><Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start py-3 text-left" onClick={() => onNavigate(row)}><div className="min-w-0"><p className="truncate font-medium">{row.title}</p><p className="truncate text-xs text-muted-foreground">{type} · {row.location}</p></div></Button><Button size="icon" variant="ghost" aria-label={`Unfavorite ${row.title}`} onClick={() => toggleFavorite(ref.type, ref.targetId).catch(error)}><Star className="size-4 fill-current text-primary" /></Button></div>)}</section> : null; }) : data?.links.slice(0, 30).map(({ ref, row }) => <div key={ref.id} className="flex items-center border-b border-border py-2"><Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start py-3 text-left" onClick={() => onNavigate(row)}><div className="min-w-0"><p className="truncate font-medium">{row.title}</p><p className="truncate text-xs text-muted-foreground">{ref.type} · {row.location} · {new Date(ref.accessedAt).toLocaleString()}</p></div></Button></div>)}</>}
    <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Edit capture</DialogTitle></DialogHeader><Textarea aria-label="Edit captured text" value={text} rows={5} onChange={(e) => setText(e.target.value)} /><Button disabled={!text.trim()} onClick={async () => { if (!editing) return; try { await saveCapture(text, editing); setEditing(null); } catch (e) { error(e); } }}>Save</Button></DialogContent></Dialog>
    <Dialog open={!!moving} onOpenChange={(v) => !v && setMoving(null)}><DialogContent><DialogHeader><DialogTitle>Move capture</DialogTitle></DialogHeader><Select value={destination} onValueChange={setDestination}><SelectTrigger aria-label="Destination section"><SelectValue placeholder="Choose project / section" /></SelectTrigger><SelectContent>{data?.sections.map((s) => <SelectItem key={s.id} value={s.id}>{data.projects.find((p) => p.id === s.projectId)?.name} / {s.title}</SelectItem>)}</SelectContent></Select><Button disabled={!destination} onClick={async () => { if (!moving) return; try { const cardId = await moveCapture(moving, destination); const s = data?.sections.find((s) => s.id === destination); setMoving(null); if (s) onNavigate({ id: cardId, title: "Captured note", type: "richtext", location: "", text: "", tags: [], projectId: s.projectId, sectionId: s.id, cardId }); toast.success("Moved to section"); } catch (e) { error(e); } }}>Move</Button></DialogContent></Dialog>
  </div>;
}

function TagsPanel({ tags, rows, onNavigate, selectedTagId }: { tags: TagRecord[]; rows: SearchResult[]; onNavigate: (row: SearchResult) => void; selectedTagId: string | null }) {
  const { prompt, confirm } = useDialogs();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(() => selectedTagId ? [selectedTagId] : []);
  const [rule, setRule] = useState<"and" | "or">("and");
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const selectedTags = selected.map((id) => tagById.get(id)).filter((tag): tag is TagRecord => !!tag);
  const visibleTags = tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  const matches = rows.filter((row) => row.cardId && selectedTags.length > 0 && (rule === "and" ? selectedTags.every((tag) => row.tags.includes(tag.name)) : selectedTags.some((tag) => row.tags.includes(tag.name))));
  async function create() {
    const name = await prompt({ title: "Create tag", label: "Tag name" });
    if (!name?.trim()) return;
    try { await ensureTag(name); } catch (e) { error(e); }
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={() => void create()}><Plus className="size-4" />Create tag</Button><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tags" aria-label="Search tags" className="h-8 max-w-sm" /></div>
    <div className="grid gap-1">
      {visibleTags.length === 0 && <p className="py-6 text-sm text-muted-foreground">No saved tags. Create one to assign it to cards.</p>}
      {visibleTags.map((tag) => {
        const count = rows.filter((row) => row.cardId && row.tags.includes(tag.name)).length;
        const active = selected.includes(tag.id);
        return <div key={tag.id} className="flex items-center gap-2 border-b border-border py-2">
          <Button size="sm" variant={active ? "secondary" : "ghost"} aria-pressed={active} onClick={() => setSelected((value) => active ? value.filter((id) => id !== tag.id) : [...value, tag.id])} className="min-w-0 flex-1 justify-start">#{tag.name}<span className="ml-auto text-xs text-muted-foreground">{count} {count === 1 ? "card" : "cards"}</span></Button>
          <Button size="icon" variant="ghost" aria-label={`Rename ${tag.name}`} onClick={async () => { const name = await prompt({ title: "Rename tag", label: "Tag name", initial: tag.name }); if (name?.trim()) renameTag(tag.id, name).catch(error); }}><Pencil className="size-4" /></Button>
          <Button size="icon" variant="ghost" aria-label={`Delete ${tag.name}`} onClick={async () => { if (await confirm({ title: "Delete tag?", body: `Remove “${tag.name}” from cards? Cards will not be deleted.`, destructive: true, confirm: "Delete tag" })) deleteTag(tag.id).then(() => setSelected((value) => value.filter((id) => id !== tag.id))).catch(error); }}><Trash2 className="size-4" /></Button>
        </div>;
      })}
    </div>
    {selectedTags.length > 0 && <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">Matching cards</h2><Select value={rule} onValueChange={(value) => setRule(value as "and" | "or")}><SelectTrigger className="h-8 w-40" aria-label="Tag matching rule"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="and">Match all (AND)</SelectItem><SelectItem value="or">Match any (OR)</SelectItem></SelectContent></Select><span className="text-xs text-muted-foreground">{selectedTags.map((tag) => `#${tag.name}`).join(" · ")}</span></div>
      {matches.length === 0 && <p className="text-sm text-muted-foreground">No cards match the selected tags.</p>}
      {matches.map((row) => <Button key={`${row.sectionId}:${row.cardId}`} variant="ghost" className="h-auto w-full justify-start border-b border-border px-2 py-3 text-left" onClick={() => onNavigate(row)}><div className="min-w-0"><p className="truncate font-medium">{row.title}</p><p className="truncate text-xs text-muted-foreground">{row.location}</p><p className="truncate text-xs text-primary">{row.tags.map((name) => `#${name}`).join(" ")}</p></div></Button>)}
    </section>}
  </div>;
}