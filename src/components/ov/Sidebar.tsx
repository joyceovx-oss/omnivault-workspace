import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, FileStack, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { db } from "@/lib/ov/db";
import { move } from "@/lib/ov/cards";
import { STARTERS } from "@/lib/ov/starters";
import {
  createProject, createSection, deleteProject, deleteSection, deleteTemplate, duplicateProject, duplicateSection,
  reorder, saveProjectTemplate, saveSectionTemplate, updateProject, updateSection,
} from "@/lib/ov/repo";
import { CATEGORIES, type Category, type Project, type Section, type Template } from "@/lib/ov/types";
import { useDialogs } from "./dialogs";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong.");

interface Props {
  projectId: string | null;
  sectionId: string | null;
  onSelectProject: (id: string | null, sectionId?: string | null) => void;
  onSelectSection: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({ projectId, sectionId, onSelectProject, onSelectSection, collapsed = false, onToggleCollapsed }: Props) {
  const { prompt, confirm } = useDialogs();
  const [showArchived, setShowArchived] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const projects = useLiveQuery(() => db.projects.orderBy("order").toArray(), []) ?? [];
  const sections = useLiveQuery(() => (projectId ? db.sections.where("projectId").equals(projectId).sortBy("order") : Promise.resolve([] as Section[])), [projectId]) ?? [];
  const sectionTpls = (useLiveQuery(() => db.templates.where("level").equals("section").toArray(), []) ?? []) as Extract<Template, { level: "section" }>[];
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  const projectMenu = (p: Project, list: Project[], i: number) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`Actions for ${p.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={async () => { const n = await prompt({ title: "Rename project", label: "Name", initial: p.name }); if (n) updateProject(p.id, { name: n }).catch(err); }}><Pencil />Rename</DropdownMenuItem>
        {!p.archived && <>
          <DropdownMenuItem disabled={i === 0} onSelect={() => reorder("projects", move(list, i, -1).map((x) => x.id)).catch(err)}><ArrowUp />Move up</DropdownMenuItem>
          <DropdownMenuItem disabled={i === list.length - 1} onSelect={() => reorder("projects", move(list, i, 1).map((x) => x.id)).catch(err)}><ArrowDown />Move down</DropdownMenuItem>
        </>}
        <DropdownMenuItem onSelect={() => duplicateProject(p.id).then(() => toast.success("Project duplicated")).catch(err)}><Copy />Duplicate</DropdownMenuItem>
        <DropdownMenuItem onSelect={async () => { const n = await prompt({ title: "Save project template", label: "Template name", initial: p.name }); if (n) saveProjectTemplate(n, p.id).then(() => toast.success("Project template saved")).catch(err); }}><Save />Save as template</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { updateProject(p.id, { archived: !p.archived }).catch(err); if (!p.archived && projectId === p.id) onSelectProject(null); }}>
          {p.archived ? <><ArchiveRestore />Restore</> : <><Archive />Archive</>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={async () => {
          if (await confirm({ title: "Delete project?", body: `"${p.name}" and all its sections and cards will be permanently deleted.`, destructive: true, confirm: "Delete project" })) {
            if (projectId === p.id) onSelectProject(null);
            deleteProject(p.id).catch(err);
          }
        }}><Trash2 />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const projectRow = (p: Project, list: Project[], i: number) => (
    <li key={p.id} className="flex items-center gap-0.5">
      <button
        onClick={() => onSelectProject(projectId === p.id ? null : p.id)}
        aria-pressed={projectId === p.id}
        className={cn("min-h-9 flex-1 truncate rounded-md px-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          projectId === p.id ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60")}
      >{p.name}</button>
      {projectMenu(p, list, i)}
    </li>
  );

  if (collapsed) {
    return (
      <nav aria-label="Projects and sections" className="flex h-full flex-col items-center gap-1 p-2">
        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={onToggleCollapsed} aria-label="Expand sidebar" aria-expanded={false} title="Expand sidebar"><PanelLeftOpen className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setNewOpen(true)} aria-label="New project" title="New project"><Plus className="size-4" /></Button>
        <div className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
          {active.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectProject(projectId === p.id ? null : p.id)}
              aria-label={p.name}
              aria-pressed={projectId === p.id}
              title={p.name}
              className={cn("grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                projectId === p.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")}
            >{p.name.trim().charAt(0) || "?"}</button>
          ))}
        </div>
        {archived.length > 0 && (
          <Button size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground" onClick={onToggleCollapsed} aria-label={`Expand sidebar to show archived (${archived.length})`} title={`Archived (${archived.length})`}><Archive className="size-4" /></Button>
        )}
        <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(p, s) => onSelectProject(p, s)} />
      </nav>
    );
  }

  return (
    <nav aria-label="Projects and sections" className="flex h-full flex-col gap-5 overflow-y-auto p-3">
      <div>
        <div className="mb-1 flex items-center justify-between gap-1 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects</h2>
          <div className="flex items-center">
            {onToggleCollapsed && <Button size="icon" variant="ghost" className="size-7" onClick={onToggleCollapsed} aria-label="Collapse sidebar" aria-expanded title="Collapse sidebar"><PanelLeftClose className="size-4" /></Button>}
            <Button size="icon" variant="ghost" className="size-7" onClick={() => setNewOpen(true)} aria-label="New project"><Plus className="size-4" /></Button>
          </div>
        </div>
        {active.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">No projects yet.</p>}
        <ul className="space-y-0.5">{active.map((p, i) => projectRow(p, active, i))}</ul>
        {archived.length > 0 && (
          <div className="mt-2">
            <button className="px-2 text-xs text-muted-foreground hover:underline" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Hide" : "Show"} archived ({archived.length})</button>
            {showArchived && <ul className="mt-1 space-y-0.5 opacity-80">{archived.map((p, i) => projectRow(p, archived, i))}</ul>}
          </div>
        )}
      </div>

      {projectId && (
        <div className="border-t border-sidebar-border pt-4">
          <div className="mb-1 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sections</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7" aria-label="Add section"><Plus className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={() => createSection(projectId).then(onSelectSection).catch(err)}><Plus />Blank section</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>From section template</DropdownMenuLabel>
                {sectionTpls.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No section templates yet.</p>}
                {sectionTpls.map((t) => (
                  <div key={t.id} className="flex items-center">
                    <DropdownMenuItem className="flex-1" onSelect={() => createSection(projectId, t.section).then(onSelectSection).catch(err)}><FileStack />{t.name}</DropdownMenuItem>
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete template ${t.name}`} onClick={async () => { if (await confirm({ title: "Delete template?", body: `"${t.name}" will be removed.`, destructive: true, confirm: "Delete" })) deleteTemplate(t.id).catch(err); }}><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ul className="space-y-0.5">
            {sections.map((s, i) => (
              <li key={s.id} className="flex items-center gap-0.5">
                <button
                  onClick={() => onSelectSection(s.id)}
                  aria-current={sectionId === s.id ? "page" : undefined}
                  className={cn("min-h-9 flex-1 truncate rounded-md border-l-2 px-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    sectionId === s.id ? "border-primary bg-background font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
                >{s.title || "Untitled"}</button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7" aria-label={`Actions for ${s.title}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={async () => { const n = await prompt({ title: "Rename section", label: "Title", initial: s.title }); if (n) updateSection(s.id, { title: n }).catch(err); }}><Pencil />Rename</DropdownMenuItem>
                    <DropdownMenuItem disabled={i === 0} onSelect={() => reorder("sections", move(sections, i, -1).map((x) => x.id)).catch(err)}><ArrowUp />Move up</DropdownMenuItem>
                    <DropdownMenuItem disabled={i === sections.length - 1} onSelect={() => reorder("sections", move(sections, i, 1).map((x) => x.id)).catch(err)}><ArrowDown />Move down</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => duplicateSection(s.id).then(onSelectSection).catch(err)}><Copy />Duplicate</DropdownMenuItem>
                    <DropdownMenuItem onSelect={async () => { const n = await prompt({ title: "Save section template", label: "Template name", initial: s.title }); if (n) saveSectionTemplate(n, s).then(() => toast.success("Section template saved")).catch(err); }}><Save />Save as template</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={sections.length === 1} onSelect={async () => {
                      if (await confirm({ title: "Delete section?", body: `"${s.title}" and its cards will be permanently deleted.`, destructive: true, confirm: "Delete section" })) {
                        const next = sections.find((x) => x.id !== s.id);
                        await deleteSection(s.id).catch(err);
                        if (sectionId === s.id && next) onSelectSection(next.id);
                      }
                    }}><Trash2 />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        </div>
      )}
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(p, s) => onSelectProject(p, s)} />
    </nav>
  );
}

function NewProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (p: string, s: string) => void }) {
  const { confirm } = useDialogs();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [source, setSource] = useState("blank");
  const tpls = (useLiveQuery(() => db.templates.where("level").equals("project").toArray(), []) ?? []) as Extract<Template, { level: "project" }>[];

  async function submit() {
    try {
      let sections, cat = category;
      if (source.startsWith("starter:")) { const s = STARTERS.find((x) => x.key === source.slice(8))!; sections = s.build(); cat = s.category; }
      else if (source.startsWith("tpl:")) { const t = tpls.find((x) => x.id === source.slice(4))!; sections = t.sections; cat = t.category; }
      const r = await createProject(name.trim(), cat, sections);
      onOpenChange(false); setName(""); setSource("blank");
      onCreated(r.projectId, r.sectionId);
    } catch (e) { err(e); }
  }
  const tplSel = source.startsWith("tpl:") ? tpls.find((t) => t.id === source.slice(4)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) submit(); }} className="space-y-4">
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
          <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Start from</span>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">Blank project</SelectItem>
                {STARTERS.map((s) => <SelectItem key={s.key} value={`starter:${s.key}`}>Starter: {s.name}</SelectItem>)}
                {tpls.map((t) => <SelectItem key={t.id} value={`tpl:${t.id}`}>Saved: {t.name}</SelectItem>)}
              </SelectContent>
            </Select></label>
          {source === "blank" && (
            <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Category</span>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select></label>
          )}
          {tplSel && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={async () => {
              if (await confirm({ title: "Delete template?", body: `"${tplSel.name}" will be removed.`, destructive: true, confirm: "Delete" })) { await deleteTemplate(tplSel.id).catch(err); setSource("blank"); }
            }}><Trash2 className="size-4" />Delete this saved template</Button>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim()}>Create project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
