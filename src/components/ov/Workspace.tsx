import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle, Check, Download, FolderOpen, KeyRound, Loader2, Menu, Moon, Settings, Sun, Upload, Vault, Search, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/ov/db";
import { useSaveState } from "@/lib/ov/status";
import { cn } from "@/lib/utils";
import { exportBackup, importBackup } from "@/lib/ov/backup";
import { DialogProvider } from "./dialogs";
import { Sidebar } from "./Sidebar";
import { SectionView } from "./SectionView";
import { CaptureDialog, SearchDialog, UtilityPanel, type UtilityView } from "./Productivity";
import { recordRecent, toggleFavorite } from "@/lib/ov/repo";
import type { SearchResult } from "@/lib/ov/search";
import { SecretsVault } from "./SecretsVault";

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(localStorage.getItem("ov-theme") === "dark"); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ov-theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

function SaveIndicator() {
  const s = useSaveState();
  if (s.state === "idle") return null;
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {s.state === "saving" && <><Loader2 className="size-3.5 animate-spin" />Saving…</>}
      {s.state === "saved" && <><Check className="size-3.5" />Saved</>}
      {s.state === "error" && <span className="flex items-center gap-1.5 text-destructive"><AlertCircle className="size-3.5" />{s.message}</span>}
    </span>
  );
}

export function Workspace() {
  return <DialogProvider><Inner /></DialogProvider>;
}

function Inner() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultCollection, setVaultCollection] = useState<string | null>(null);
  const [view, setView] = useState<UtilityView | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [focusCard, setFocusCard] = useState<string | null>(null);
  const favorites = useLiveQuery(() => db.references.where("kind").equals("favorite").toArray(), []) ?? [];
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("ov-sidebar") === "collapsed");
  const [dark, setDark] = useTheme();

  useEffect(() => {
    const openVault = (event: Event) => {
      const collection = (event as CustomEvent<{ collection?: string }>).detail?.collection;
      setVaultCollection(collection?.trim() || null);
      setVaultOpen(true);
    };
    window.addEventListener("ov-open-vault", openVault);
    return () => window.removeEventListener("ov-open-vault", openVault);
  }, []);

  useEffect(() => { localStorage.setItem("ov-sidebar", collapsed ? "collapsed" : "expanded"); }, [collapsed]);

  // One query so project and sections always resolve together for the same id.
  const data = useLiveQuery(async () => {
    if (!projectId) return { id: null, project: undefined, sections: null };
    const [project, sections] = await Promise.all([db.projects.get(projectId), db.sections.where("projectId").equals(projectId).sortBy("order")]);
    return { id: projectId, project, sections };
  }, [projectId]);
  const fresh = data?.id === projectId;
  const project = fresh ? data?.project : undefined;
  const sections = fresh ? data?.sections : undefined;
  const section = sections?.find((s) => s.id === sectionId) ?? sections?.[0];

  // If the selected project disappears (deleted elsewhere), restore the empty state.
  useEffect(() => { if (projectId && fresh && !data?.project) setProjectId(null); }, [data, fresh, projectId]);

  useEffect(() => { if (projectId) recordRecent("project", projectId).catch(() => {}); }, [projectId]);
  useEffect(() => { if (section?.id && !view) recordRecent("section", section.id).catch(() => {}); }, [section?.id, view]);
  useEffect(() => {
    if (!focusCard || view) return;
    const el = document.getElementById(`card-${focusCard}`);
    if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
  }, [focusCard, section, view]);
  const selectProject = (id: string | null, sid: string | null = null) => { setView(null); setFocusCard(null); setProjectId(id); setSectionId(sid); setNavOpen(false); };
  const navigateResult = (r: SearchResult) => { if (!r.projectId) return; selectProject(r.projectId, r.sectionId ?? null); setFocusCard(r.cardId ?? null); if (r.cardId) recordRecent("card", r.cardId).catch(() => {}); };
  const navProps = { projectId: view ? null : projectId, sectionId: section?.id ?? null, onSelectProject: selectProject, onSelectSection: (id: string) => { setView(null); setFocusCard(null); setSectionId(id); setNavOpen(false); }, utilityView: view, onOpenUtility: (v: UtilityView) => { setView(v); setNavOpen(false); } };
  const sidebar = <Sidebar {...navProps} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />;
  const drawer = <Sidebar {...navProps} />;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button size="icon" variant="ghost" className="size-9 md:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></Button>
        <span className="flex items-center gap-1.5 font-semibold tracking-tight"><Vault className="size-5 text-primary" />OmniVault</span>
        {project && <span className="hidden truncate text-sm text-muted-foreground sm:inline">/ {project.name}{section ? ` / ${section.title}` : ""}</span>}
        <div className="ml-auto flex items-center gap-1">
          <SaveIndicator />
          <Button size="icon" variant="ghost" className="size-9" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}><Search className="size-4" /></Button>
          <Button size="icon" variant="ghost" className="size-9" aria-label="Quick capture" title="Quick capture" onClick={() => setCaptureOpen(true)}><Plus className="size-4" /></Button>
          <Button size="icon" variant="ghost" className="size-9" onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
          <Button size="icon" variant="ghost" className="size-9" onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings className="size-4" /></Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside id="ov-sidebar" className={cn("hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:block", collapsed ? "w-12" : "w-64")}>{sidebar}</aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0"><SheetTitle className="sr-only">Navigation</SheetTitle>{drawer}</SheetContent>
        </Sheet>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {view ? <UtilityPanel view={view} onNavigate={navigateResult} onCapture={() => setCaptureOpen(true)} /> : projectId && section ? (
            <>
              <div className="mx-auto w-full max-w-3xl px-4 pt-5 sm:px-8">
                <div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{project?.name}</p><Button size="icon" variant="ghost" className="size-7" aria-label="Favorite project" title="Favorite project" aria-pressed={favorites.some((f) => f.targetId === projectId)} onClick={() => toggleFavorite("project", projectId).catch(() => toast.error("Could not save favorite"))}><Star className={cn("size-4", favorites.some((f) => f.targetId === projectId) && "fill-current text-primary")} /></Button></div>
                <nav aria-label="Project sections" className="mt-2 border-b border-border">
                  <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
                    {sections?.map((s) => {
                      const active = s.id === section.id;
                      return (
                        <Button variant="ghost"
                          key={s.id}
                          role="tab"
                          aria-selected={active}
                          ref={active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                          onClick={() => { setFocusCard(null); setSectionId(s.id); }}
                          className={`max-w-48 shrink-0 truncate border-b-2 px-3 py-2 text-sm transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                        >
                          {s.title || "Untitled"}
                        </Button>
                      );
                    })}
                  </div>
                </nav>
              </div>
              <SectionView key={section.id} section={section} focusCard={focusCard} />
            </>
          ) : projectId && sections === undefined ? null : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <FolderOpen className="mb-4 size-10 text-muted-foreground/60" />
              <h1 className="text-xl font-semibold">Create a project or choose a project</h1>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">Select a project from the sidebar, or create a new one to get started.</p>
              <Button variant="secondary" size="sm" className="mt-5 md:hidden" onClick={() => setNavOpen(true)}>Open projects</Button>
            </div>
          )}
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} dark={dark} setDark={setDark} onOpenVault={() => { setSettingsOpen(false); setVaultCollection(null); setVaultOpen(true); }} />
      <SecretsVault open={vaultOpen} onOpenChange={setVaultOpen} initialCollection={vaultCollection} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} onNavigate={navigateResult} projectId={projectId} sectionId={section?.id} />
      <CaptureDialog open={captureOpen} onOpenChange={setCaptureOpen} />
    </div>
  );
}

function SettingsDialog({ open, onOpenChange, dark, setDark, onOpenVault }: { open: boolean; onOpenChange: (o: boolean) => void; dark: boolean; setDark: (d: boolean) => void; onOpenVault: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function doExport() {
    setBusy(true);
    try {
      const blob = await exportBackup();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `omnivault-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.success("Backup downloaded");
    } catch { toast.error("Backup failed."); } finally { setBusy(false); }
  }
  async function doImport(f: File) {
    setBusy(true);
    try { const n = await importBackup(f); toast.success(`Imported ${n} project${n === 1 ? "" : "s"}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Import failed."); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Your workspace is stored on this device only. It doesn't sync between devices.</DialogDescription></DialogHeader>
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Theme</h3>
          <div className="flex gap-2">
            <Button size="sm" variant={!dark ? "default" : "secondary"} onClick={() => setDark(false)}><Sun className="size-4" />Light</Button>
            <Button size="sm" variant={dark ? "default" : "secondary"} onClick={() => setDark(true)}><Moon className="size-4" />Dark</Button>
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Backup</h3>
          <p className="text-sm text-muted-foreground">A ZIP with all projects, templates and attached files. Secrets are never included. Importing adds to your existing data.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={doExport}><Download className="size-4" />Export backup</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => file.current?.click()}><Upload className="size-4" />Import backup</Button>
            <input ref={file} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
          </div>
        </section>
        <section className="space-y-1">
          <h3 className="text-sm font-medium">Secrets Vault</h3>
          <p className="text-sm text-muted-foreground">Credentials are encrypted locally and protected by a master password. Vault contents are excluded from workspace backups.</p>
          <Button size="sm" variant="secondary" onClick={onOpenVault}><KeyRound />Open local vault</Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}
