import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, Download, ExternalLink, Expand, KeyRound, Plus, Trash2, Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/ov/db";
import { addAttachment } from "@/lib/ov/repo";
import { move, uid } from "@/lib/ov/cards";
import { safeUrl, youtubeEmbed } from "@/lib/ov/url";
import type { ChecklistCard, ChoiceCard, FileCard, ImageCard, LinkCard, VaultRefCard } from "@/lib/ov/types";

type P<T> = { card: T; editing: boolean; onChange: (c: T) => void };

function RowControls({ i, n, onMove, onRemove, label }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void; label: string }) {
  return (
    <div className="flex shrink-0">
      <Button size="icon" variant="ghost" className="size-8" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}><ArrowUp className="size-3.5" /></Button>
      <Button size="icon" variant="ghost" className="size-8" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}><ArrowDown className="size-3.5" /></Button>
      <Button size="icon" variant="ghost" className="size-8" onClick={onRemove} aria-label={`Remove ${label}`}><Trash2 className="size-3.5" /></Button>
    </div>
  );
}

/* ---------- Checklist ---------- */
export function ChecklistBody({ card, editing, onChange }: P<ChecklistCard>) {
  const [draft, setDraft] = useState("");
  const set = (items: ChecklistCard["items"]) => onChange({ ...card, items });
  const add = () => {
    if (!draft.trim()) return;
    set([...card.items, { id: uid(), text: draft.trim(), done: false }]);
    setDraft("");
  };
  const done = card.items.filter((i) => i.done).length;
  return (
    <div className="space-y-1">
      {card.items.length > 0 && <p className="text-xs text-muted-foreground">{done} of {card.items.length} done</p>}
      <ul className="space-y-0.5">
        {card.items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-2 min-h-9">
            <Checkbox checked={it.done} onCheckedChange={(v) => set(card.items.map((x) => (x.id === it.id ? { ...x, done: !!v } : x)))} aria-label={`Mark "${it.text}" ${it.done ? "not done" : "done"}`} />
            {editing ? (
              <>
                <Input value={it.text} onChange={(e) => set(card.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} className="h-8" aria-label="Item text" />
                <RowControls i={i} n={card.items.length} label="item" onMove={(d) => set(move(card.items, i, d))} onRemove={() => set(card.items.filter((x) => x.id !== it.id))} />
              </>
            ) : (
              <span className={it.done ? "text-muted-foreground line-through" : ""}>{it.text}</span>
            )}
          </li>
        ))}
      </ul>
      {card.items.length === 0 && !editing && <p className="text-sm text-muted-foreground">No items yet.</p>}
      <form className="flex gap-2 pt-1" onSubmit={(e) => (e.preventDefault(), add())}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an item" className="h-8" aria-label="New checklist item" />
        <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}><Plus className="size-4" />Add</Button>
      </form>
    </div>
  );
}

/* ---------- Radio / Dropdown ---------- */
export function ChoiceBody({ card, editing, onChange }: P<ChoiceCard>) {
  const setOptions = (options: ChoiceCard["options"]) =>
    onChange({ ...card, options, selected: options.some((o) => o.id === card.selected) ? card.selected : null });
  if (editing)
    return (
      <div className="space-y-1">
        {card.options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2">
            <Input value={o.label} onChange={(e) => setOptions(card.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} className="h-8" aria-label="Option label" />
            <RowControls i={i} n={card.options.length} label="option" onMove={(d) => setOptions(move(card.options, i, d))} onRemove={() => setOptions(card.options.filter((x) => x.id !== o.id))} />
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setOptions([...card.options, { id: uid(), label: `Option ${card.options.length + 1}` }])}><Plus className="size-4" />Add option</Button>
      </div>
    );
  if (card.options.length === 0) return <p className="text-sm text-muted-foreground">No options yet — edit to add some.</p>;
  if (card.type === "radio")
    return (
      <RadioGroup value={card.selected ?? ""} onValueChange={(v) => onChange({ ...card, selected: v })} aria-label={card.title}>
        {card.options.map((o) => (
          <label key={o.id} className="flex min-h-8 items-center gap-2 text-sm">
            <RadioGroupItem value={o.id} />
            {o.label || "Untitled"}
          </label>
        ))}
      </RadioGroup>
    );
  return (
    <div className="flex items-center gap-2">
      <Select value={card.selected ?? ""} onValueChange={(v) => onChange({ ...card, selected: v })}>
        <SelectTrigger className="w-64 max-w-full" aria-label={card.title}><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>
          {card.options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label || "Untitled"}</SelectItem>)}
        </SelectContent>
      </Select>
      {card.selected && <Button size="sm" variant="ghost" onClick={() => onChange({ ...card, selected: null })}><X className="size-4" />Clear</Button>}
    </div>
  );
}

/* ---------- attachments ---------- */
function useAttachment(id: string | null) {
  const att = useLiveQuery(() => (id ? db.attachments.get(id) : undefined), [id]);
  const url = useMemo(() => (att ? URL.createObjectURL(att.blob) : null), [att]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return { att, url, loading: !!id && att === undefined };
}

function Picker({ accept, label, onFile }: { accept: string; label: string; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}><Upload className="size-4" />{label}</Button>
    </>
  );
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE = 20 * 1024 * 1024;

export function ImageBody({ card, onChange }: P<ImageCard>) {
  const { att, url } = useAttachment(card.attachmentId);
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const upload = async (f: File) => {
    if (!IMAGE_TYPES.includes(f.type)) return toast.error("Use a PNG, JPEG, WebP or GIF image.");
    if (f.size > MAX_IMAGE) return toast.error("Images must be 20 MB or smaller.");
    try { onChange({ ...card, attachmentId: await addAttachment(f, f.name) }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-2">
      {card.attachmentId && !att && att !== undefined && <p className="text-sm text-destructive">The image file is missing.</p>}
      {url && !broken && (
        <div className={card.mode === "actual" ? "max-h-[70vh] overflow-auto rounded-md border" : ""}>
          <img src={url} alt={card.title} onError={() => setBroken(true)} className={card.mode === "fit" ? "h-auto max-w-full rounded-md" : "max-w-none"} />
        </div>
      )}
      {broken && <p className="text-sm text-destructive">This image couldn't be displayed.</p>}
      <div className="flex flex-wrap gap-2">
        <Picker accept={IMAGE_TYPES.join(",")} label={url ? "Replace" : "Upload image"} onFile={upload} />
        {url && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...card, mode: card.mode === "fit" ? "actual" : "fit" })}>{card.mode === "fit" ? "Actual size" : "Fit to page"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Expand className="size-4" />Expand</Button>
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...card, attachmentId: null })}><Trash2 className="size-4" />Remove</Button>
          </>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw]">
          <DialogHeader><DialogTitle>{card.title}</DialogTitle></DialogHeader>
          <div className="max-h-[80vh] overflow-auto">{url && <img src={url} alt={card.title} className="max-w-none" />}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function FileBody({ card, onChange }: P<FileCard>) {
  const { att, url } = useAttachment(card.attachmentId);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvases = useRef<HTMLDivElement>(null);
  const isPdf = att?.mime === "application/pdf";
  useEffect(() => setText(null), [card.attachmentId]);

  async function loadPdf() {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    return pdfjs.getDocument({ data: new Uint8Array(await att!.blob.arrayBuffer()), isEvalSupported: false }).promise;
  }
  async function extract() {
    setBusy(true);
    try {
      const pdf = await loadPdf();
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const tc = await (await pdf.getPage(i)).getTextContent();
        parts.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      }
      const t = parts.join("\n\n").trim();
      setText(t || "");
    } catch { toast.error("Couldn't read this PDF."); } finally { setBusy(false); }
  }
  async function preview() {
    setBusy(true);
    try {
      const pdf = await loadPdf();
      const host = canvases.current!;
      host.replaceChildren();
      for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.3 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        c.className = "mb-2 h-auto max-w-full rounded border";
        host.appendChild(c);
        await page.render({ canvas: c, viewport: vp }).promise;
      }
    } catch { toast.error("Couldn't render this PDF."); } finally { setBusy(false); }
  }
  const upload = async (f: File) => {
    try { onChange({ ...card, attachmentId: await addAttachment(f, f.name) }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-2">
      {att && (
        <div className="flex items-center gap-2 text-sm"><FileText className="size-4 text-muted-foreground" /><span className="font-medium">{att.name}</span><span className="text-muted-foreground">{fmtSize(att.size)}</span></div>
      )}
      {card.attachmentId && att === undefined ? null : card.attachmentId && !att && <p className="text-sm text-destructive">The file is missing.</p>}
      <div className="flex flex-wrap gap-2">
        <Picker accept="*/*" label={att ? "Replace" : "Upload file"} onFile={upload} />
        {att && url && (
          <>
            <Button size="sm" variant="ghost" asChild><a href={url} download={att.name}><Download className="size-4" />Download</a></Button>
            {isPdf && <Button size="sm" variant="ghost" disabled={busy} onClick={preview}>Preview</Button>}
            {isPdf && <Button size="sm" variant="ghost" disabled={busy} onClick={extract}>Extract text</Button>}
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...card, attachmentId: null })}><Trash2 className="size-4" />Remove</Button>
          </>
        )}
      </div>
      {busy && <p className="text-sm text-muted-foreground">Working…</p>}
      <div ref={canvases} className="max-h-[70vh] overflow-auto empty:hidden" />
      {text !== null && (text ? (
        <Textarea readOnly value={text} className="h-48 font-mono text-xs" aria-label="Extracted text" />
      ) : (
        <p className="text-sm text-muted-foreground">No selectable text found. Scanned PDFs need OCR, which isn't supported.</p>
      ))}
    </div>
  );
}

/* ---------- Link ---------- */
export function LinkBody({ card, editing, onChange }: P<LinkCard>) {
  const [draft, setDraft] = useState(card.url);
  useEffect(() => setDraft(card.url), [card.url]);
  const safe = card.url ? safeUrl(card.url) : null;
  const embed = safe ? youtubeEmbed(safe) : null;
  const commit = () => {
    if (!draft.trim()) return onChange({ ...card, url: "" });
    const u = safeUrl(draft);
    if (!u) return toast.error("Enter a valid http(s) or mailto link.");
    onChange({ ...card, url: u });
  };
  return (
    <div className="space-y-2">
      {(editing || !card.url) && (
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), commit())}>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} placeholder="https://…" aria-label="URL" className="h-8" />
        </form>
      )}
      {safe && (
        <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 break-all text-sm text-primary underline underline-offset-2">
          {safe}<ExternalLink className="size-3.5 shrink-0" />
        </a>
      )}
      {embed && (
        <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-md border">
          <iframe src={embed} title={card.title} className="size-full" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
        </div>
      )}
      {editing ? (
        <Textarea value={card.notes} onChange={(e) => onChange({ ...card, notes: e.target.value })} placeholder="Notes" aria-label="Notes" />
      ) : card.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{card.notes}</p>}
    </div>
  );
}

/* ---------- Vault reference ---------- */
export function VaultRefBody({ card, editing, onChange }: P<VaultRefCard>) {
  return (
    <div className="space-y-2 text-sm">
      {editing ? (
        <label className="block space-y-1"><span className="text-muted-foreground">Vault collection</span>
          <Input value={card.collection} onChange={(e) => onChange({ ...card, collection: e.target.value })} className="h-8" />
        </label>
      ) : (
        <div className="flex items-center gap-2"><KeyRound className="size-4 text-primary" />Collection: <span className="font-medium">{card.collection}</span></div>
      )}
      <p className="text-muted-foreground">
        This card only points to a vault collection — secret values are never stored here. The encrypted Secrets Vault with authenticator sign-in isn't available yet in this version.
      </p>
    </div>
  );
}
