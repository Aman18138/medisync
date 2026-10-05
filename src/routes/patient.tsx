import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PortalShell, SectionCard } from "@/components/shell";
import { speak, useOfflineDb, verifyLocalPin } from "@/lib/offline-db";

export const Route = createFileRoute("/patient")({
  head: () => ({
    meta: [
      { title: "Patient Passport — MediSync Offline Medical Record" },
      {
        name: "description",
        content:
          "Lifetime medical passport timeline, live vitals, allergy alerts, accessibility voice tools and local prescription token sharing — all stored on-device.",
      },
      { property: "og:title", content: "Patient Passport — MediSync" },
      {
        property: "og:description",
        content:
          "Your lifetime medical passport, stored on your own device behind a local PIN checkpoint.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientPortal,
});

const captions = [
  "Dr. Barker: Blood pressure reading is one eighteen over seventy six.",
  "Nurse: Recording heart rate at seventy two beats per minute.",
  "Dr. Barker: Continue Amlodipine ten milligrams once daily.",
  "System: Local mesh node MESH-02 acknowledged the chart update.",
  "Dr. Barker: Follow-up consultation scheduled in thirty days.",
];

const symptoms = [
  "Chest Pain",
  "High Fever",
  "Shortness of Breath",
  "Dizziness",
  "Severe Headache",
];

function PatientPortal() {
  const { db, update, log } = useOfflineDb();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [selectedRx, setSelectedRx] = useState("RX-101");
  const [broadcast, setBroadcast] = useState<string | null>(null);

  const authed = unlocked || db.emergencyBypass;

  useEffect(() => {
    const t = window.setInterval(() => setCaptionIndex((i) => (i + 1) % captions.length), 3000);
    return () => window.clearInterval(t);
  }, []);

  const handleUnlock = async () => {
    if (!pin.trim()) return;
    const valid = await verifyLocalPin(pin, db.patient.id);
    setUnlocked(valid);
    if (!valid) {
      setPin("");
      log(`Failed patient vault PIN attempt for ${db.patient.id}`);
    } else {
      log(`Patient vault unlocked for ${db.patient.id}`);
    }
  };

  if (!authed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-4">
        <div className="card-elevated w-full max-w-sm p-8 text-center">
          <h1 className="brand-title text-2xl text-navy">Patient Passport</h1>
          <p className="clinical-data mt-2 text-navy/60">
            Enter your on-device vault PIN to open your local record.
          </p>
          <input
            value={pin}
            inputMode="numeric"
            aria-label="Vault PIN"
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleUnlock()}
            className="clinical-data mt-5 w-full rounded-lg border-2 border-nuit px-4 py-3 text-center tracking-[0.4em] focus:border-pbgreen focus:outline-none"
            placeholder="••••"
          />
          <button
            onClick={() => void handleUnlock()}
            className="clinical-label mt-4 w-full rounded-lg bg-pbgreen py-3 font-bold text-canvas hover:brightness-110"
          >
            Open Local Vault
          </button>
          {pin.length >= 4 && !unlocked && (
            <p className="clinical-data mt-3 text-alert">Invalid PIN for this local node.</p>
          )}
        </div>
      </div>
    );
  }

  const doBroadcast = () => {
    const rx = db.prescriptions.find((p) => p.id === selectedRx);
    if (!rx) return;
    setBroadcast(`Signing token ${rx.id} with on-device key…`);
    window.setTimeout(
      () => setBroadcast(`Broadcasting ${rx.signature} over BLE GATT channel…`),
      700,
    );
    window.setTimeout(() => {
      update((d) => ({
        ...d,
        prescriptions: d.prescriptions.map((p) =>
          p.id === rx.id ? { ...p, bleReceived: true } : p,
        ),
      }));
      log(`Prescription token ${rx.id} delivered to pharmacy node via BLE`);
      setBroadcast(
        `Simulated transfer complete for ${rx.id}. Check signature status in the pharmacist portal.`,
      );
    }, 1600);
  };

  return (
    <PortalShell
      title={`Patient Passport · ${db.patient.name}`}
      subtitle={`${db.patient.id} · ABHA ${db.patient.abha} · Blood ${db.patient.bloodGroup} · Age ${db.patient.age}`}
      nav={[
        { label: "Dashboard", id: "dashboard" },
        { label: "Medical Passport Timeline", id: "timeline" },
        { label: "Active Prescriptions", id: "metrics" },
        { label: "Trusted Local Pharmacies", id: "pharmacies" },
        { label: "Settings", id: "settings" },
      ]}
    >
      <SectionCard
        id="dashboard"
        eyebrow="UNIVERSAL ACCESSIBILITY LAYER"
        title="Accessibility Control Panel"
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-lg bg-canvas p-4">
            <p className="clinical-label text-navy">Blind Patient Bot</p>
            <p className="clinical-data mt-1 text-navy/65">
              Speech synthesis reads your identity, allergies and active medication aloud.
            </p>
            <button
              onClick={() =>
                speak(
                  `Health status for ${db.patient.name}. Allergies: ${db.patient.allergies
                    .map((a) => `${a.name}, ${a.severity}`)
                    .join(". ")}. Active medications: ${db.prescriptions
                    .map((p) => p.medicine)
                    .join(", ")}. Blood pressure ${db.vitals.bloodPressure}.`,
                )
              }
              className="clinical-label mt-3 w-full rounded-lg bg-pbgreen py-2 text-canvas hover:brightness-110"
            >
              🔊 Listen to My Health Status
            </button>
          </div>

          <div className="rounded-lg bg-navy p-4">
            <p className="clinical-label text-spring">Deaf Patient Captions</p>
            <p className="clinical-data mt-1 text-canvas/60">Live clinical voice transcript</p>
            <div className="mt-3 h-24 overflow-hidden rounded-md bg-navy-soft p-3">
              {[0, 1, 2].map((offset) => (
                <p
                  key={offset}
                  className={`clinical-data ${offset === 0 ? "text-spring" : "text-canvas/55"}`}
                >
                  {captions[(captionIndex + offset) % captions.length]}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-canvas p-4">
            <p className="clinical-label text-navy">Mute Patient Tap-to-Speak</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {symptoms.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    speak(s);
                    update((d) => ({
                      ...d,
                      diagnosticCache: [
                        { symptom: s, at: new Date().toLocaleTimeString() },
                        ...d.diagnosticCache,
                      ].slice(0, 12),
                    }));
                  }}
                  className="clinical-data rounded-md border border-nuit/40 bg-white px-2 py-2 text-navy hover:border-pbgreen hover:bg-mantis/15"
                >
                  🗣 {s}
                </button>
              ))}
            </div>
            {db.diagnosticCache.length > 0 && (
              <p className="clinical-data mt-3 text-nuit">
                Local diagnostic cache: {db.diagnosticCache.map((c) => c.symptom).join(", ")}
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard id="timeline" eyebrow="SECTION A" title="Lifetime Medical Passport Timeline">
        <ol className="relative border-l-2 border-nuit/30 pl-6">
          {db.records.map((r) => (
            <li key={r.id} className="mb-6 last:mb-0">
              <span className="absolute -left-[9px] mt-1.5 size-4 rounded-full border-2 border-white bg-mantis" />
              <div className="rounded-lg border border-navy/10 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="brand-title text-base text-navy">{r.hospital}</p>
                  <span className="clinical-data rounded-full bg-spring px-3 text-navy">
                    {r.date}
                  </span>
                </div>
                <p className="clinical-label text-nuit">
                  {r.department} · {r.doctor}
                </p>
                <dl className="clinical-data mt-2 grid gap-1 text-navy/75 md:grid-cols-3">
                  <div>
                    <dt className="text-navy/50">Symptoms</dt>
                    <dd>{r.symptoms}</dd>
                  </div>
                  <div>
                    <dt className="text-navy/50">Diagnosis</dt>
                    <dd className="text-pbgreen">{r.diagnosis}</dd>
                  </div>
                  <div>
                    <dt className="text-navy/50">Treatment</dt>
                    <dd>{r.treatment}</dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <div id="metrics" className="grid gap-6 lg:grid-cols-3">
        <SectionCard eyebrow="SECTION B" title="Current Health Metrics">
          <dl className="clinical-data space-y-2">
            {Object.entries(db.vitals).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-navy/10 pb-1">
                <dt className="text-navy/60 uppercase">{k.replace(/([A-Z])/g, " $1")}</dt>
                <dd className="font-bold text-navy">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Severe Allergy Alerts">
          <div className="space-y-2">
            {db.patient.allergies.map((a) => (
              <div key={a.name} className="rounded-lg bg-alert p-3 text-canvas">
                <p className="clinical-label">⚠ {a.name}</p>
                <p className="clinical-data">{a.severity} — do not administer.</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Active Medications">
          <ul className="clinical-data space-y-2">
            {db.prescriptions
              .filter((p) => p.status !== "Dispensed & Vault Locked")
              .map((p) => (
                <li key={p.id} className="rounded-lg border border-navy/10 p-3">
                  <span className="font-bold text-navy">{p.medicine}</span>
                  <br />
                  {p.frequency} · {p.duration}
                  <br />
                  <span
                    className={
                      p.status === "Dispensation Pending" ? "text-nuit" : "font-bold text-pbgreen"
                    }
                  >
                    {p.id} — {p.status}
                  </span>
                </li>
              ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard id="pharmacies" eyebrow="SECTION C" title="BLE Local Share Card">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="clinical-data block text-navy/70">
            Select an active prescription token
            <select
              value={selectedRx}
              onChange={(e) => setSelectedRx(e.target.value)}
              className="clinical-data mt-1 w-full rounded-lg border-2 border-nuit bg-white px-3 py-2 text-navy focus:outline-none"
            >
              {db.prescriptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.medicine} ({p.status})
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={doBroadcast}
            className="clinical-label rounded-lg bg-pbgreen px-5 py-3 font-bold text-canvas hover:brightness-110"
          >
            Simulate token transfer
          </button>
        </div>
        {broadcast && (
          <p className="clinical-data animate-fade-in mt-4 rounded-lg bg-navy p-3 text-mantis">
            {broadcast}
          </p>
        )}
        <div className="clinical-data mt-4 grid gap-2 md:grid-cols-3">
          {[
            "Rostova Family Chemist (0.2 km)",
            "St. Jude Pharmacy (0.9 km)",
            "MeshNode PH-04 (1.4 km)",
          ].map((ph) => (
            <div key={ph} className="rounded-lg border border-navy/10 bg-canvas p-3 text-navy/75">
              🏥 {ph} · <span className="text-mantis">Peer online</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="settings" title="Settings & Local Vault">
        <p className="clinical-data text-navy/70">
          Records stored locally on this device · {db.syncLog.length} local activity events.
        </p>
      </SectionCard>
    </PortalShell>
  );
}
