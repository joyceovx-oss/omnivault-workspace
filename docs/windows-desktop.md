# Windows Desktop Build

## Build locally

Install Node.js 22, Bun 1.2.22 or later, Rust stable with the MSVC Windows target, and the Microsoft C++ Build Tools. Install WebView2 if it is not already present, then run:

```powershell
bun install --frozen-lockfile
bun run test
bun run build
bun run tauri:build
```

The NSIS installer is generated under `src-tauri/target/release/bundle/nsis/`.
The existing favicon is used as the Windows application icon.

## Build with GitHub Actions

The `Build Windows desktop installer` workflow runs on pushes to the `side` feature branch and on manual dispatch. To start it manually, open **Actions**, select **Build Windows desktop installer**, choose **Run workflow**, and select the `side` branch. The workflow runs the test suite, builds the production frontend, builds the Tauri app on `windows-latest`, verifies an `.exe` or `.msi` exists, and uploads it as `omnivault-windows-installer`.

When the run succeeds, open that workflow run in **Actions**, find **Artifacts**, and download `omnivault-windows-installer`. Extract the download and run the `.exe` installer. Windows may show an unsigned-app warning because this workflow does not use a signing key. Do not bypass organization security policy; signed distribution requires a separately managed signing certificate and secrets configured in GitHub Actions.

## Troubleshooting

- A test failure stops the job before packaging; investigate its Vitest output rather than skipping the test step.
- A Rust or linker failure usually indicates a missing Windows C++ Build Tools component or an invalid Rust target. The workflow installs the MSVC target and uses the hosted Windows image.
- If packaging succeeds but installer verification fails, inspect the Tauri build log and `src-tauri/target/release/bundle/` output.
- The upload step fails if no installer file is present; a frontend build alone is not considered a desktop build.

## Storage and vault status

This package currently embeds the existing OmniVault frontend without changing its storage implementation. Projects, sections, templates, inbox, trash, references, and attachment blobs still use Dexie/IndexedDB; browser theme and sidebar preferences use localStorage. Tauri WebView storage is persistent application data, but the application does **not** currently use SQLite or migrate browser data into a SQLite database. Export a workspace ZIP using the app's backup action before using a future storage migration. No migration from browser data to the installed application is implemented or verified by this packaging change.

The Secrets Vault is now stored in a separate local IndexedDB database. It encrypts complete credential payloads with AES-256-GCM using a random data key, wrapped by a key derived from the local master password with PBKDF2-HMAC-SHA-256 (600,000 iterations). The password is not persisted or sent to a service. The vault locks when closed, when the app is hidden, or after five minutes without activity. Vault records are not included in workspace ZIP backups. There is no password reset or recovery; losing the master password or deleting local app data makes vault contents unrecoverable. This local design does not provide server-side protection against malware or offline guessing against a copied database.

The workflow builds and uploads the Windows installer only after its GitHub Actions run succeeds. It does not prove a SQLite workspace migration: ordinary workspace records still use Dexie/IndexedDB, and migrating existing browser workspace data is not implemented. Vault cryptography and local negative paths have unit tests, but an installed-app restart test and Windows vault UI test remain outstanding.
