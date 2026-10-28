import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultRefBody } from "@/components/ov/CardBodies";
import { newCard } from "@/lib/ov/cards";
import { lockVault, readCardSecret, secretsDb, unlockVault } from "@/lib/ov/vault";
import type { VaultRefCard } from "@/lib/ov/types";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

const card = () => newCard("vaultref") as VaultRefCard;

beforeEach(async () => {
  lockVault();
  await secretsDb.delete();
  await secretsDb.open();
});

afterEach(() => {
  cleanup();
  lockVault();
});

describe("inline Secret card", () => {
  it("initializes the shared vault, masks input and saves only encrypted secret data", async () => {
    const onChange = vi.fn();
    render(<VaultRefBody card={card()} editing onChange={onChange} />);
    await screen.findByText("Create your master password");
    fireEvent.change(screen.getByLabelText(/Master password/), { target: { value: "correct horse battery staple" } });
    fireEvent.change(screen.getByLabelText("Confirm master password"), { target: { value: "correct horse battery staple" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create vault" }).closest("form")!);
    await waitFor(() => expect(screen.queryByText("Create your master password")).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Secret identifier"), { target: { value: "deploy key" } });
    const input = screen.getByLabelText("Secret value") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "highly-private-value" } });
    expect(input.type).toBe("password");
    fireEvent.change(screen.getByLabelText("Secret note"), { target: { value: "Production" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ identifier: "deploy key", note: "Production" })));
    const savedCard = onChange.mock.calls[0]![0] as VaultRefCard;
    const row = await secretsDb.cardSecrets.get(savedCard.id);
    expect(JSON.stringify(row)).not.toContain("highly-private-value");
    await unlockVault("correct horse battery staple");
    expect(await readCardSecret(savedCard.id)).toBe("highly-private-value");
  });

  it("asks for the master password before revealing and preserves an existing secret on blank edit", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const value = card();
    render(<VaultRefBody card={value} editing onChange={vi.fn()} />);
    await screen.findByText("Create your master password");
    fireEvent.change(screen.getByLabelText(/Master password/), { target: { value: "correct horse battery staple" } });
    fireEvent.change(screen.getByLabelText("Confirm master password"), { target: { value: "correct horse battery staple" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create vault" }).closest("form")!);
    await waitFor(() => expect(screen.queryByText("Create your master password")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "keep-this-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Leave empty to keep the current encrypted secret.");
    lockVault();

    cleanup();
    const saved = { ...value, identifier: "account", note: "note" };
    const update = vi.fn();
    render(<VaultRefBody card={saved} editing={false} onChange={update} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal secret" }));
    const password = await screen.findByLabelText("Master password");
    fireEvent.change(password, { target: { value: "incorrect password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Verify" }).closest("form")!);
    await screen.findByRole("alert");
    expect(screen.queryByText("keep-this-secret")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Master password"), { target: { value: "correct horse battery staple" } });
    fireEvent.submit(screen.getByRole("button", { name: "Verify" }).closest("form")!);
    expect(await screen.findByText("keep-this-secret")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide secret" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy secret" }));
    fireEvent.change(await screen.findByLabelText("Master password"), { target: { value: "correct horse battery staple" } });
    fireEvent.submit(screen.getByRole("button", { name: "Verify" }).closest("form")!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("keep-this-secret"));

    cleanup();
    render(<VaultRefBody card={saved} editing onChange={update} />);
    await waitFor(() => expect(screen.getByText("Leave empty to keep the current encrypted secret.")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Secret identifier"), { target: { value: "renamed account" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ identifier: "renamed account" })));
    await unlockVault("correct horse battery staple");
    expect(await readCardSecret(saved.id)).toBe("keep-this-secret");
  });
});
