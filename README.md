# OmniVault Workspace

# OMNIVAULT: COMPLETE PRODUCT AND IMPLEMENTATION SPECIFICATION

## ROLE

Act as a senior full-stack engineer, product designer, UX architect, and security engineer. Build OmniVault as a working, responsive application, not a static prototype.

Prioritize complete user flows, clean architecture, a polished interface, and reliable data persistence. Optimize implementation effort and avoid unnecessary dependencies, repeated rewrites, speculative features, and excessive visual decoration.

Use Lovable Cloud for backend features that genuinely need it. Do not introduce a second backend, paid third-party service, AI API, or unnecessary integration.

## 1. PRODUCT VISION

**OmniVault is one customizable workspace for projects, ideas, resources, and securely stored secrets.**

Its hierarchy is:

**Project → Section → Card**

It should work for writing, software development, art, research, studying, and general-purpose organization.

Its differentiators are:
- Flexible project structures rather than rigid project-management workflows.
- Reusable templates at card, section, and project levels.
- Card Stitch, which combines cards into a logical component without flattening their original types.
- A separate encrypted Secrets vault with genuine two-step verification.
- A clean, document-like workspace that avoids interface clutter.

Build the smallest complete and reliable version of this product. Do not add collaboration, billing, social features, AI integrations, or complex project-management dashboards.

## 2. TECHNICAL ARCHITECTURE

Use React, TypeScript, Vite, Tailwind CSS, and the existing Lovable-compatible component system. Use reusable, accessible components and strict TypeScript types.

Use:
- **IndexedDB**, preferably through Dexie, for ordinary projects, sections, templates, and attachment blobs.
- **Lovable Cloud** for authentication, database records, server-side functions, and security-sensitive backend operations for the Secrets vault.
- A maintained rich-text editor such as Tiptap.
- A maintained PDF rendering and text-extraction library.
- A maintained ZIP library for complete ordinary-workspace backups.

The standard workspace must work without account creation and support local persistence. The Secrets vault requires authenticated access and online verification.

Do not claim that local-only workspace data automatically syncs between devices. Cloud sync for ordinary workspace content is out of scope for the first release.

Keep features in separate modules or services: projects, sections, cards, editors, templates, attachments, import/export, authentication, and vault encryption.

Use versioned data schemas and migrations. Avoid giant monolithic components and duplicated event handlers.

## 3. DESIGN AND LAYOUT

Create a polished, minimal, document-oriented interface called **OmniVault**.

Use the previous ContextForge workspace layout as the reference, updating the brand and improving any weak usability.

### Desktop layout

Use:
1. A compact top header with the OmniVault identity, navigation controls, saving status, theme toggle, and settings.
2. A left sidebar with the project list at the top and the selected project's sections beneath it.
3. A main workspace displaying the active section and its vertically arranged content cards.

Keep the project and section navigation easy to distinguish. On mobile, make the sidebar collapsible and comfortable to operate by touch.

### Visual direction

Use a warm, neutral background, restrained violet accent, readable typography such as Inter, and generous but efficient spacing. Include light and dark themes.

Sections must blend into the main workspace background. Do not enclose entire sections in a prominent rounded card, bordered panel, shadowed box, or decorative container.

Individual content cards may use subtle separators or restrained borders. The overall workspace should feel like a readable, vertically scrollable document, not a stack of nested cards.

Keep controls compact and show advanced controls only when needed. Provide visible keyboard focus, accessible labels, suitable contrast, and clear loading, empty, saved, error, and confirmation states.

Do not add unnecessary landing-page marketing, fake statistics, decorative dashboards, or sample data that obstructs the actual workspace.

## 4. EMPTY STATE AND PROJECT SELECTION

This behavior is mandatory.

On a fresh installation:
- Show no preselected project.
- Do not create fictional example projects.
- Show no sections in the section area.
- Show no section tabs, document heading, content cards, card controls, or section-specific actions.
- Display the following centered message in the main workspace:

**Create a project or choose a project**

Supporting text:

“Select a project from the sidebar, or create a new one to get started.”

The project sidebar should still allow creation of a project or a project from a starter template.

When a project is selected, display its sections and workspace.

Clicking the currently selected project again must deselect it and restore the exact empty state without changing or deleting any data.

Creating a project must select it automatically and open its initial section.

Selecting another project must display that project's own sections and cards.

The empty state must be based on genuine application state, not a visual overlay.

## 5. PROJECTS AND SECTIONS

### Projects

Implement:
- Create and name a project.
- Choose a project category or use a generic custom project.
- Select and deselect projects.
- Rename and reorder projects.
- Duplicate projects with independent data and fresh identifiers.
- Archive and restore projects.
- Delete projects with confirmation.
- Create a project from a saved project template.
- Save the current project as a reusable template.

Provide useful starter templates for writing, software, art, research or learning, and general-purpose work. These must be optional templates, not preloaded sample projects.

### Sections

Within a selected project, implement:
- Create, rename, reorder, duplicate, and delete sections.
- Navigate between sections.
- Save a section as a template.
- Create a section from a saved template.

A new project should begin with a simple Overview section. A section must have a title, optional description, ordered cards, and the relevant configuration.

Use explicit confirmation for destructive actions. Reordering or switching sections must never lose content.

## 6. CARD SYSTEM

Build a reusable, typed card system. Every card has a unique ID, type, editable title, type-specific data, and ordering information.

Initial card types:
1. Rich Text
2. Checklist
3. Radio Selection
4. Dropdown Selection
5. Image
6. File Attachment
7. Link and Media
8. Secrets Vault Reference

### Add Card menu

Use one compact Add Card dropdown containing all available types. Do not show a permanent row of separate buttons for every card type.

Provide a separate Templates menu for finding and inserting saved templates. Both menus must work by click and touch, not hover alone.

### Rich Text card

Implement distinct reading and editing modes.

**Reading mode:** Display the card title as ordinary text, the formatted content, and a subtle edit control. Do not show permanent title inputs or formatting toolbars.

**Editing mode:** Make the title editable and show a toolbar with bold, italic, underline, Heading 1/2/3, paragraph, block quotation, highlight, bulleted list, numbered list, hyperlink, and clear formatting.

The Done action must save changes and return the card to reading mode. Editing should not silently lose data when users navigate away.

Use structured editor data where practical. Sanitize content and URLs. Never execute user-provided HTML or scripts.

### Checklist

Users can add, edit, reorder, complete, uncomplete, and remove items. Changes must persist. Duplicate cards with new item identifiers.

When creating a checklist from a template, reset all items to unchecked by default.

### Radio and Dropdown

Allow users to create, rename, reorder, and delete options. Radio allows one selected value; Dropdown allows a compact selection and a way to clear or change the value. Validate selections when options change.

### Card actions

Support edit, duplicate, move up/down, select, delete, save as template, and any applicable type-specific actions. Use working interactions rather than decorative icons.

## 7. CARD STITCH

Implement Card Stitch as a real structural operation.

Users can select two or more cards at the same level within a section and combine them into a composite component.

A composite must preserve each child card's:
- Type and title.
- Content and configuration.
- Selected values.
- Internal structure and order.

Stitching must not flatten children into text or convert them into a different type.

Users can reorder and duplicate the composite, save it as a card template, and ungroup it to restore its original children to the section.

Limit the initial version to same-section, same-level stitching. Do not support recursive nested composites in this release. Reject unsupported selections clearly rather than silently losing cards.

Ensure stitching and ungrouping preserve every child and its order.

## 8. THREE LEVELS OF TEMPLATES

### Card templates
Preserve one card's type, title, content, and configuration. A composite card template preserves all its children.

### Section templates
Preserve the section title, description, configuration, card ordering, and child cards.

### Project templates
Preserve the project's category, settings, sections, card structures, and ordering.

Implement save, name, browse, insert, and delete actions. Project templates should create new projects. Section templates should create new sections. Card templates should insert new cards or composites.

Every insertion creates independent records with fresh IDs. Editing an inserted instance must never modify its source template or other instances.

Reset checklist completion when inserting templates. Copy attachments safely, creating valid new attachment records as necessary. Never copy plaintext secrets into templates. A Secrets Vault Reference may preserve only its type and a harmless placeholder or collection reference.

Provide a helpful empty state when no templates have been saved.

## 9. IMAGES, FILES, PDFS, AND MEDIA

### Image cards
- Support PNG, JPEG, WebP, and GIF where browser support permits.
- Preserve original proportions and never crop automatically.
- Provide Fit to Page and Actual Size modes.
- Provide an expanded or scrollable image viewer for large images.
- Store binary data in IndexedDB, not giant base64 strings inside ordinary project JSON.
- Handle file-size limits, loading failures, and invalid files clearly.

### File Attachment cards
- Preserve the original attachment and metadata.
- Support upload, preview where possible, replacement, removal, and download.
- Store files persistently in IndexedDB with references from cards.
- Support PDF rendering and extraction of selectable text.
- Do not claim that scanned PDFs are readable through ordinary text extraction. OCR is out of scope for the first release.

### Link and Media cards
- Support a title, URL, and optional notes.
- Validate protocols and accept safe web links.
- Provide a working external-link action.
- Embed recognized media providers such as YouTube only when safe and supported.
- Use a normal clickable link if embedding is unavailable.

Do not execute arbitrary remote page code or allow embeds to access the vault.

## 10. SECURE SECRETS VAULT

The Secrets Vault is a distinct security boundary, not an ordinary card or project field.

The Secrets Vault Reference card only opens or references a protected collection. Actual secret values must never be stored inside ordinary project records, templates, card JSON, or workspace exports.

The vault may store credential records containing a name, username or identifier, secret value, optional URL, notes, and tags. Mask secret values by default, with explicit reveal and copy controls.

### Authentication and genuine two-step verification

Use Lovable Cloud's supported authentication capabilities and actual authenticator-app TOTP MFA, backed by Supabase Auth where provided by Lovable Cloud.

Implement:
- Account enrollment and sign-in when the vault is first used.
- Authenticator enrollment with QR code and manual setup fallback.
- Verification before marking MFA enrollment complete.
- A real TOTP challenge during login or vault access.
- Session verification using the provider's MFA assurance level.
- Vault lock, inactivity timeout, and explicit re-verification.
- Protected settings for viewing and managing the enrolled factor.

Do not implement a fake MFA dialog, hardcoded codes, mock verification, or a frontend-only flag. A normal authenticated session must not be treated as an MFA-verified session.

### Client-side encryption

Encrypt all secret record content in the client before persistence.

Use AES-256-GCM authenticated encryption through Web Crypto or a maintained library. Generate a cryptographically secure random data-encryption key, a fresh unique nonce for each encryption operation, and versioned encrypted records.

Use a maintained Argon2id implementation for deriving a key-encryption key from a separate vault passphrase, where practical. If unsupported in the selected browser stack, use a defensible Web Crypto PBKDF2-HMAC-SHA-256 fallback with a strong documented work factor. Never invent cryptography.

The vault passphrase must remain client-side and must not be sent to the authentication provider or backend.

### Meaningful MFA enforcement

Do not rely solely on hiding the vault screen after login.

Use a key-access design where the random vault data-encryption key is wrapped using key material derived from both:
1. The user's vault passphrase.
2. A protected server-derived key share that is obtainable only after genuine MFA verification.

Store the server-only root secret in Lovable Cloud's server-side secrets, never in frontend code or the database. A server-side function must authenticate the user, verify the actual MFA assurance level is AAL2, and only then derive and return a per-user key share. It must not receive the vault passphrase, plaintext secret values, or plaintext data-encryption key.

Combine the share and passphrase-derived material on the client to unwrap the vault key. Keep unlocked key material in memory only, and clear it when the vault locks or the authenticated session ends.

Never persist the server share in browser storage. Never ship server-only secrets to the client bundle.

### Backend and database security

Use a dedicated vault data model. At minimum, encrypted vault records and the wrapped vault-key envelope must be separate from ordinary project data.

Store only encrypted secret payloads plus necessary metadata and versioned encryption parameters. Encrypt secret names and values together to minimize metadata leakage.

Apply row-level security so a user can access only their own vault records. Enforce the MFA assurance requirement at the database and protected server-function layers, not just in the UI.

Use server-side rate limits and the authentication provider's supported protections. Never log secret values, master passphrases, TOTP codes, recovery credentials, decrypted payloads, or key material.

All errors must fail closed. Tampered ciphertext, incorrect credentials, or missing key material must prevent decryption.

### Security honesty and recovery

Do not claim the vault is production-ready until encryption, actual MFA, row-level security, key release, and negative-path tests pass.

Document the limitations of browser-based apps and the chosen key-sharing architecture.

If no secure recovery mechanism is implemented, clearly explain that losing the vault passphrase or required recovery capability may make encrypted data unrecoverable. Do not add a silent bypass around MFA to make recovery easier.

If the authentication backend or server-side configuration is unavailable, identify the exact setup required. Do not replace the missing integration with mocked verification or plaintext storage.

## 11. PERSISTENCE AND BACKUP

Automatically save ordinary workspace changes to IndexedDB and display accurate saved, saving, and failure states.

Handle database errors and quota limits without claiming a failed save succeeded.

Implement:
- Export of ordinary projects and templates.
- Complete backup as a ZIP containing validated JSON plus all referenced attachment bytes.
- Import of that ZIP with validation and useful error messages.
- Fresh identifiers or safe conflict handling during import.
- Schema versioning and migrations.

Ordinary exports must never include actual Secrets values, plaintext keys, or vault key shares. Secret references may export only harmless placeholders. Encrypted vault backup is outside the first release unless it can be implemented with a separate, explicit, secure flow.

## 12. SETTINGS AND USABILITY

Provide a compact settings area for theme, basic workspace preferences, backup/import/export actions, and Secrets Vault access.

Use responsive dialogs for creating projects and sections, naming templates, confirming deletion, and managing vault authentication.

Use clear empty states, inline errors, accessible focus states, and meaningful feedback after successful actions. Avoid browser prompts when a consistent, accessible in-app dialog is straightforward.

All controls must have working behavior. Do not leave dead buttons, misleading status indicators, fake loading, or hardcoded success messages.

## 13. IMPLEMENTATION AND CREDIT EFFICIENCY

Build in logical milestones within this single product scope:

1. Responsive shell, visual system, true empty state, project/section CRUD, typed data model, and IndexedDB.
2. Card registry, rich-text modes, checklist, radio, dropdown, and compact menus.
3. Card Stitch and the three independent template levels.
4. Image/file storage, PDF text extraction, link/media safety, and complete backup/import.
5. Lovable Cloud authentication, verified TOTP MFA, encrypted vault, protected key release, and database policies.
6. End-to-end validation, responsive polish, security checks, and documentation.

Keep the application runnable throughout. Reuse existing components and dependencies. Avoid introducing a new library when the existing stack already provides the needed capability.

Do not repeatedly rewrite working components while adding unrelated features. Do not build duplicate data layers or separate implementations of the same control.

After each milestone, run focused tests and the production build before proceeding. Fix regressions before moving on.

## 14. REQUIRED VALIDATION

Use the available Lovable browser-testing and test tools.

Verify that:
- The fresh workspace has no selected project or visible sections/cards.
- Selecting and deselecting projects works without data loss.
- Project and section CRUD survives reloads.
- Text editing, formatting, card actions, and checklist state persist.
- Radio and dropdown choices work.
- Card Stitch and ungroup preserve child types, content, and order.
- All three template levels produce independent copies and reset checklists.
- Attachments survive reload, export, and import.
- Images preserve aspect ratio.
- Invalid URLs and unsafe imported HTML are rejected or sanitized.
- Ordinary exports exclude real Secrets data.
- An unauthenticated user cannot access vault records.
- An AAL1-only session cannot retrieve the protected key share or access vault records.
- A valid TOTP challenge upgrades the session to AAL2.
- An invalid MFA code is rejected by the actual provider.
- The persisted vault contains ciphertext rather than plaintext secret payloads.
- Tampering with ciphertext causes authenticated decryption to fail.
- Locking the vault clears the decrypted UI and in-memory key state to the extent supported by the application.
- The production build and applicable tests pass.

Separate mocked unit tests from verified live-backend results. Never describe mocked tests as proof of live MFA or production security.

## 15. DEFINITION OF DONE

Deliver a working application with:
- A polished, responsive document-like workspace.
- Correct empty-state and project-selection behavior.
- Fully working projects, sections, cards, Card Stitch, and reusable templates.
- Persistent image and file attachments, safe links, and reliable backups.
- Real encryption and authenticator-app MFA for the separate Secrets Vault.
- Proper database ownership and MFA enforcement.
- No placeholder interactions disguised as finished features.
- A clear setup guide and a concise report of tests passed, setup dependencies, and any genuine limitations.

Start from the current repository state. Inspect what's present, reuse what works, and implement the specification with the fewest safe changes required. Do not stop after producing a plan or a pretty interface. Complete the working flows, run the available tests, and clearly report anything that could not be verified.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aff12f46-68ef-471d-b130-460242b7e954).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
