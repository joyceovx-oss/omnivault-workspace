import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle, Check, Download, FolderOpen, Loader2, Menu, Moon, Settings, Sun, Upload, Vault } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/ov/db";
import { useSaveState } from "@/lib/ov/status";
import { exportBackup, importBackup } from "@/lib/ov/backup";
import { DialogProvider } from "./dialogs";
import { Sidebar } from "./Sidebar";
import { SectionView } from "./SectionView";

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
  const [dark, setDark] = useTheme();

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

  const selectProject = (id: string | null, sid: string | null = null) => { setProjectId(id); setSectionId(sid); setNavOpen(false); };
  const sidebar = <Sidebar projectId={projectId} sectionId={section?.id ?? null} onSelectProject={selectProject} onSelectSection={(id) => { setSectionId(id); setNavOpen(false); }} />;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button size="icon" variant="ghost" className="size-9 md:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></Button>
        <span className="flex items-center gap-1.5 font-semibold tracking-tight"><Vault className="size-5 text-primary" />OmniVault</span>
        {project && <span className="hidden truncate text-sm text-muted-foreground sm:inline">/ {project.name}{section ? ` / ${section.title}` : ""}</span>}
        <div className="ml-auto flex items-center gap-1">
          <SaveIndicator />
          <Button size="icon" variant="ghost" className="size-9" onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
          <Button size="icon" variant="ghost" className="size-9" onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings className="size-4" /></Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block">{sidebar}</aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0"><SheetTitle className="sr-only">Navigation</SheetTitle>{sidebar}</SheetContent>
        </Sheet>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {projectId && section ? (
            <>
              <div className="mx-auto w-full max-w-3xl px-4 pt-5 sm:px-8">
                <p className="truncate text-sm font-medium text-muted-foreground">{project?.name}</p>
                <nav aria-label="Project sections" className="mt-2 border-b border-border">
                  <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
                    {sections!.map((s) => {
                      const active = s.id === section.id;
                      return (
                        <button
                          key={s.id}
                          role="tab"
                          aria-selected={active}
                          ref={active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                          onClick={() => setSectionId(s.id)}
                          className={`max-w-48 shrink-0 truncate border-b-2 px-3 py-2 text-sm transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                        >
                          {s.title || "Untitled"}
                        </button>
                      );
                    })}
                  </div>
                </nav>
              </div>
              <SectionView key={section.id} section={section} />
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
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} dark={dark} setDark={setDark} />
    </div>
  );
}

function SettingsDialog({ open, onOpenChange, dark, setDark }: { open: boolean; onOpenChange: (o: boolean) => void; dark: boolean; setDark: (d: boolean) => void }) {
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
        <DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Your workspace is stored in this browser only. It doesn't sync between devices.</DialogDescription></DialogHeader>
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
          <p className="text-sm text-muted-foreground">The encrypted vault with authenticator-app sign-in is not set up yet in this version.</p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
