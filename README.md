# MediSync

MediSync: an offline-first medical record and prescription system with signed, single-use prescriptions.

Live demo: https://medisync122.netlify.app | Track: Open Innovation (Healthcare operations, Accessibility, Safety and trust) | Event: WCC Launchpad 30 | Team: [TEAM NAME] | Members: [NAMES]

## The problem

- Prescriptions can be forged or filled twice.
- Patient history is scattered across providers.
- Emergency information such as allergies and blood group is not available fast.
- Cloud-only systems fail when connectivity drops.

## Evidence

| Question | Result |
|---|---|
| Have you encountered prescriptions that could be forged or filled twice? | [X of N] |
| Is patient history scattered across providers a problem? | [X of N] |
| Can emergency information be hard to access quickly? | [X of N] |
| Have cloud connectivity problems disrupted care workflows? | [X of N] |

Survey/notes: [LINK]

## Our solution

1. A doctor signs a prescription with ECDSA P-256; its canonical payload is hashed with SHA-256.
2. The pharmacist verifies the signature and hash; an edited prescription is **INVALID**.
3. Dispensing runs as one atomic Dexie transaction that records the status and audit entry.
4. A second dispense is refused, including when two tabs race to dispense the same prescription.
5. A prescription can be printed with a QR code containing its id, payload hash, signature, and payload.

## Try it in 3 minutes (live demo)

- On first load, wait a few seconds, search `elena`, tap **Set active patient**, open the Patient Passport, and use PIN `1234`.
- Open the pharmacist portal and select the prescription marked **demo: tampered**. It shows **INVALID** and cannot be dispensed.
- Open a valid prescription and dispense it. In a second tab, try to dispense it again; the second attempt is refused.
- Data is stored on each device. A new device or private window starts with fresh demo data.
- Use Chrome or Edge.

## Demo accounts

These identities and PINs are seeded in the local vault. Patient PINs are checked by the Patient Passport. Doctor and pharmacist IDs/PIN hashes are seeded, but the Doctor and Pharmacist portals do not currently require or verify a login.

| Role | Username / ID | Name | PIN |
|---|---|---|---|
| Patient | `PAT-99203` | Elena Rostova | `1234` |
| Patient | `PAT-10001` | Nadia Merz | `1234` |
| Patient | `PAT-10002` | Rohit Nair | `1234` |
| Patient | `PAT-10003` | Aarav Shah | `1234` |
| Patient | `PAT-10004` | Elena Ross | `1234` |
| Doctor (seeded; no portal login) | `DOC-001` | Dr. Barker | `1234` |
| Doctor (seeded; no portal login) | `DOC-002` | Dr. Elena | `1234` |
| Pharmacist (seeded; no portal login) | `PH-04` | Pharmacist Node 04 | `1234` |
| Pharmacist (seeded; no portal login) | `PH-09` | Pharmacist Node 09 | `1234` |

## REAL vs SIMULATED vs NOT DONE

| Capability | Status |
|---|---|
| ECDSA signing and verification; edited-payload tamper detection | **Real** — browser Web Crypto signs canonical payloads and checks their SHA-256 hash and ECDSA signature. Demo private keys are stored in localStorage. |
| Atomic dispense guard (Dexie transaction) | **Real** — verifies the prescription is issued, records dispense details and writes an audit entry in one transaction. |
| Cross-tab sync and peer heartbeat (BroadcastChannel) | **Real** — local tabs announce vault changes and a 3-second heartbeat; this is not device-to-device sync. |
| Patient search (partial, case-insensitive) | **Real** — local search across patient id, name, phone, and ABHA id. |
| Prescription QR and print | **Real** — QR content and A4 prescription print are implemented; QR import is not. |
| Data stored locally in IndexedDB (Dexie) | **Real** — records are stored in this browser's IndexedDB; signing keys are in localStorage. |
| Emergency bypass (reason, session-only, audit entry) | **Real, limited** — requires a reason, displays a critical-data snapshot, and logs the reason to the local audit table. Its in-memory state resets on reload. |
| PIN hashing and login for `/doctor` and `/pharmacist` | **Not done** — PIN hashes exist in seeded role records, but those portals do not check them or require login. |
| Encryption at rest (AES-GCM) | **Not done**. |
| Offline reload (service worker) | **Not done**. |
| Bluetooth mesh between phones | **Simulated** — sync is between open tabs on the same browser/device only. |
| Voice scribe, captions, device pairing | **Simulated** — no voice-to-chart recognition or real hardware pairing. |
| Patient-record printing, QR import, body map | **Not done**. |

## Responsible design

Patient records and signing keys stay in browser storage on the device. The app makes no third-party clinical-data/API calls; Google Fonts are loaded remotely for typography. All patient data is synthetic. Prescription signing/approval and emergency-bypass reasons are audited locally; allergy overrides are not implemented. Simulated features are labeled in the UI.

**Known limitations:** a browser cannot stop a user editing their own device storage, which is why signatures and hashes are checked on every device; real use would need a security review, patient consent, a native app for true Bluetooth, and compliance work (India's DPDP Act and ABDM).

## Tech stack

- React 19 and TypeScript
- TanStack Start and TanStack Router
- Tailwind CSS
- Dexie with IndexedDB
- Web Crypto API and BroadcastChannel
- `qrcode`
- Vitest
- Nitro Netlify preset and Netlify hosting

## Run locally

```sh
npm install
npm run dev
npm test
npm run build
```

## Deployment

Netlify build command: `npm run build`  
Publish directory: `dist`

## Disclosure

Before the event we created an initial UI prototype with Lovable (landing page, four portal layouts, design system). Its logic was mostly simulated. That starting point is tagged pre-event-baseline in git. During the event we built: real ECDSA signing and verification, the atomic dispense guard, the Dexie data layer, cross-tab sync, search, QR printing, tests and deployment. AI tools used: Lovable, GitHub Copilot, Claude. All code was reviewed and tested by the team.

See `git diff --stat pre-event-baseline..HEAD`.

## What's next

- AES-GCM encryption at rest
- A service worker for offline reload
- Patient-record printing and QR import
- A body map
- A native app for real Bluetooth
- A pilot with consent and a security review
- Optional ABHA/ABDM integration
