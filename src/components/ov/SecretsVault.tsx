import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, KeyRound, LockKeyhole, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createVault, deleteCredential, hasVault, isVaultUnlocked, listCredentials, lockVault, saveCredential, unlockVault, type VaultCredential } from "@/lib/ov/vault";
import { safeUrl } from "@/lib/ov/url";

const EMPTY_CREDENTIAL = {
  collection: "General",
  name: "",
  username: "",
  secret: "",
  url: "",
  notes: "",
  tags: [] as string[],
};
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCollection: string | null;
};

export function SecretsVault({ open, onOpenChange, initialCollection }: Props) {
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(EMPTY_CREDENTIAL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    setFilter(initialCollection?.trim() ?? "");
    setError("");
    void hasVault().then(async (exists) => {
      if (!active) return;
      setConfigured(exists);
      const alreadyUnlocked = exists && isVaultUnlocked();
      if (alreadyUnlocked) {
        try {
          const records = await listCredentials();
          if (!active) return;
          setCredentials(records);
          setUnlocked(true);
        } catch (cause) {
          lockVault();
          setUnlocked(false);
          throw cause;
        }
      } else {
        setUnlocked(false);
        setCredentials([]);
      }
    }).catch(() => {
      if (active) setError("Could not open the local vault database.");
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [open, initialCollection]);

  useEffect(() => {
    if (!open || !unlocked) return;
    let timer = 0;
    const lockForInactivity = () => {
      lockVault();
      setUnlocked(false);
      setCredentials([]);
      setForm(EMPTY_CREDENTIAL);
      setEditingId(null);
      setRevealed([]);
      setError("The vault locked after inactivity.");
    };
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lockForInactivity, IDLE_TIMEOUT_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") lockForInactivity();
    };
    window.addEventListener("pointerdown", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("touchstart", resetTimer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    resetTimer();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [open, unlocked]);

  const collections = useMemo(() => [...new Set(credentials.map((credential) => credential.collection))].sort(), [credentials]);
  const visibleCredentials = useMemo(
    () => credentials.filter((credential) => !filter || credential.collection === filter),
    [credentials, filter],
  );

  function closeVault() {
    lockVault();
    setUnlocked(false);
    setCredentials([]);
    setPassphrase("");
    setConfirmation("");
    setForm(EMPTY_CREDENTIAL);
    setEditingId(null);
    setRevealed([]);
    setDeleteId(null);
    onOpenChange(false);
  }

  async function refreshCredentials() {
    setCredentials(await listCredentials());
  }

  async function submitPassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (configured) {
        await unlockVault(passphrase);
      } else {
        if (passphrase !== confirmation) throw new Error("The master passwords do not match.");
        await createVault(passphrase);
        setConfigured(true);
      }
      const records = await listCredentials();
      setPassphrase("");
      setConfirmation("");
      setCredentials(records);
      setUnlocked(true);
    } catch (cause) {
      lockVault();
      setUnlocked(false);
      setCredentials([]);
      setError(cause instanceof Error ? cause.message : "Could not unlock the vault.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (form.url && !safeUrl(form.url)) throw new Error("Enter a valid HTTP or HTTPS URL.");
      await saveCredential({ ...form, id: editingId ?? undefined, tags: form.tags });
      await refreshCredentials();
      setForm({ ...EMPTY_CREDENTIAL, collection: filter || initialCollection?.trim() || "General" });
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this credential.");
    } finally {
      setBusy(false);
    }
  }

  function editCredential(credential: VaultCredential) {
    setEditingId(credential.id);
    setForm({
      collection: credential.collection,
      name: credential.name,
      username: credential.username,
      secret: credential.secret,
      url: credential.url,
      notes: credential.notes,
      tags: credential.tags,
    });
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await deleteCredential(deleteId);
      await refreshCredentials();
      setDeleteId(null);
      if (editingId === deleteId) {
        setEditingId(null);
        setForm(EMPTY_CREDENTIAL);
      }
      setRevealed((items) => items.filter((id) => id !== deleteId));
      toast.success("Credential deleted");
    } catch {
      setError("Could not delete this credential.");
    }
  }

  async function copySecret(credential: VaultCredential) {
    try {
      await navigator.clipboard.writeText(credential.secret);
      toast.success("Secret copied");
    } catch {
      toast.error("Clipboard access is unavailable.");
    }
  }

  function lockNow() {
    lockVault();
    setUnlocked(false);
    setCredentials([]);
    setForm(EMPTY_CREDENTIAL);
    setEditingId(null);
    setRevealed([]);
    setError("");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : closeVault()}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Local Secrets Vault</DialogTitle>
            <DialogDescription>Encrypted on this device. Your master password is never sent anywhere.</DialogDescription>
          </DialogHeader>
          {busy && !unlocked ? <p role="status" className="text-sm text-muted-foreground">Opening vault…</p> : !unlocked ? (
            <form className="space-y-4" onSubmit={submitPassphrase}>
              <p className="text-sm text-muted-foreground">
                {configured ? "Enter your master password to unlock your credentials." : "Create a master password with at least 12 characters. Forgetting it means the encrypted vault cannot be recovered."}
              </p>
              <label className="block space-y-1.5 text-sm font-medium">
                Master password
                <Input type="password" autoComplete={configured ? "current-password" : "new-password"} minLength={12} required value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
              </label>
              {!configured && <label className="block space-y-1.5 text-sm font-medium">
                Confirm master password
                <Input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}><KeyRound />{configured ? "Unlock vault" : "Create encrypted vault"}</Button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="vault-collection-filter">Filter collection</label>
                <select id="vault-collection-filter" className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="">All collections</option>
                  {collections.map((collection) => <option key={collection} value={collection}>{collection}</option>)}
                </select>
                <Button size="sm" variant="secondary" onClick={() => {
                  setEditingId(null);
                  setForm({ ...EMPTY_CREDENTIAL, collection: filter || initialCollection?.trim() || "General" });
                }}><Plus />New credential</Button>
                <Button size="icon" variant="ghost" className="ml-auto" title="Lock vault" aria-label="Lock vault" onClick={lockNow}><LockKeyhole /></Button>
              </div>

              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

              <form className="space-y-3 border-y border-border py-4" onSubmit={submitCredential}>
                <h3 className="text-sm font-semibold">{editingId ? "Edit credential" : "Credential"}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">Collection<Input required maxLength={80} value={form.collection} onChange={(event) => setForm({ ...form, collection: event.target.value })} /></label>
                  <label className="space-y-1 text-sm">Name<Input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                  <label className="space-y-1 text-sm">Username or identifier<Input autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
                  <label className="space-y-1 text-sm">Secret<Input required type="password" autoComplete="new-password" value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} /></label>
                  <label className="space-y-1 text-sm">Website URL<Input type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label>
                  <label className="space-y-1 text-sm">Tags<Input value={form.tags.join(", ")} onChange={(event) => setForm({ ...form, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
                </div>
                <label className="block space-y-1 text-sm">Notes<Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busy}>{editingId ? "Save changes" : "Save credential"}</Button>
                  {editingId && <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY_CREDENTIAL); }}>Cancel</Button>}
                </div>
              </form>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Credentials <span className="font-normal text-muted-foreground">({visibleCredentials.length})</span></h3>
                {visibleCredentials.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No credentials in this collection.</p> : visibleCredentials.map((credential) => (
                  <article key={credential.id} className="border-b border-border py-3 last:border-0">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <h4 className="truncate text-sm font-medium">{credential.name}</h4>
                          <span className="text-xs text-muted-foreground">{credential.collection}</span>
                        </div>
                        {credential.username && <p className="mt-1 truncate text-sm text-muted-foreground">{credential.username}</p>}
                        <p className="mt-1 break-all font-mono text-sm">{revealed.includes(credential.id) ? credential.secret : "••••••••••••"}</p>
                        {credential.url && safeUrl(credential.url) && <a className="mt-1 block truncate text-xs text-primary underline" href={safeUrl(credential.url)!} target="_blank" rel="noreferrer">{credential.url}</a>}
                        {credential.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{credential.notes}</p>}
                        {credential.tags.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{credential.tags.join(", ")}</p>}
                      </div>
                      <div className="flex shrink-0">
                        <Button size="icon" variant="ghost" title={revealed.includes(credential.id) ? "Hide secret" : "Reveal secret"} aria-label={revealed.includes(credential.id) ? "Hide secret" : "Reveal secret"} onClick={() => setRevealed((items) => items.includes(credential.id) ? items.filter((id) => id !== credential.id) : [...items, credential.id])}>{revealed.includes(credential.id) ? <EyeOff /> : <Eye />}</Button>
                        <Button size="icon" variant="ghost" title="Copy secret" aria-label="Copy secret" onClick={() => void copySecret(credential)}><Copy /></Button>
                        <Button size="icon" variant="ghost" title="Edit credential" aria-label="Edit credential" onClick={() => editCredential(credential)}><Pencil /></Button>
                        <Button size="icon" variant="ghost" title="Delete credential" aria-label="Delete credential" onClick={() => setDeleteId(credential.id)}><Trash2 /></Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">This vault is stored separately from workspace backups. If you forget the master password, the credentials cannot be recovered.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(next) => { if (!next) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this credential?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes its encrypted record from this device.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}