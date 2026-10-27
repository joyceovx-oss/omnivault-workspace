import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PromptReq = { kind: "prompt"; title: string; label: string; initial?: string; confirm?: string };
type ConfirmReq = { kind: "confirm"; title: string; body: string; confirm?: string; destructive?: boolean };
type Req = (PromptReq | ConfirmReq) & { resolve: (v: string | boolean | null) => void };

const Ctx = createContext<{
  prompt: (r: Omit<PromptReq, "kind">) => Promise<string | null>;
  confirm: (r: Omit<ConfirmReq, "kind">) => Promise<boolean>;
} | null>(null);

export function useDialogs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("DialogProvider missing");
  return c;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Req | null>(null);
  const [value, setValue] = useState("");
  const done = useRef(false);

  const prompt = useCallback(
    (r: Omit<PromptReq, "kind">) =>
      new Promise<string | null>((resolve) => {
        done.current = false;
        setValue(r.initial ?? "");
        setReq({ ...r, kind: "prompt", resolve: resolve as Req["resolve"] });
      }),
    [],
  );
  const confirm = useCallback(
    (r: Omit<ConfirmReq, "kind">) =>
      new Promise<boolean>((resolve) => {
        done.current = false;
        setReq({ ...r, kind: "confirm", resolve: resolve as Req["resolve"] });
      }),
    [],
  );

  const close = (v: string | boolean | null) => {
    if (!req || done.current) return;
    done.current = true;
    req.resolve(v);
    setReq(null);
  };

  return (
    <Ctx.Provider value={{ prompt, confirm }}>
      {children}
      <Dialog open={!!req} onOpenChange={(o) => !o && close(req?.kind === "confirm" ? false : null)}>
        <DialogContent className="sm:max-w-md">
          {req && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (req.kind === "prompt") {
                  if (value.trim()) close(value.trim());
                } else close(true);
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>{req.title}</DialogTitle>
                {req.kind === "confirm" && <DialogDescription>{req.body}</DialogDescription>}
              </DialogHeader>
              {req.kind === "prompt" && (
                <label className="block space-y-1.5 text-sm">
                  <span className="text-muted-foreground">{req.label}</span>
                  <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} />
                </label>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => close(req.kind === "confirm" ? false : null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={req.kind === "confirm" && req.destructive ? "destructive" : "default"}
                  disabled={req.kind === "prompt" && !value.trim()}
                >
                  {req.confirm ?? (req.kind === "prompt" ? "Save" : "Confirm")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
