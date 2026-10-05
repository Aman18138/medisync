import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PortalShell, SectionCard } from "@/components/shell";
import { useOfflineDb } from "@/lib/offline-db";
import { signPrescriptionPayload } from "@/lib/vault/crypto";

export const Route = createFileRoute("/doctor")({
  head: () => ({
    meta: [
      { title: "Doctor Clinical Workstation — MediSync" },
      {
        name: "description",
        content:
          "Offline AI voice-to-chart scribe, Bluetooth peripheral pairing and electronically signed prescriptions on the MediSync clinical workstation.",
      },
      { property: "og:title", content: "Doctor Clinical Workstation — MediSync" },
      {
        property: "og:description",
        content: "Ambient scribe, BLE peripherals and on-device signed prescriptions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DoctorPortal,
});

const mockDevices = [
  "Omron BP Monitor M7 (BLE)",
  "Nonin Pulse Oximeter 3230",
  "ContecECG-90A 12-Lead",
  "Welch Allyn Thermoscan",
];

function Waveform({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (active) {
        ctx.strokeStyle = "#74C365";
      } else {
        ctx.strokeStyle = "#1E488F";
      }
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const amp = active ? 22 : 4;
        const y =
          canvas.height / 2 +
          Math.sin((x + frame * 3) / 12) * amp * Math.sin((x + frame) / 60) +
          Math.sin((x + frame * 5) / 5) * (active ? 5 : 1);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return <canvas ref={ref} width={640} height={96} className="h-24 w-full rounded-md bg-navy" />;
}

function DoctorPortal() {
  const { db, patients, selectPatient, update, log } = useOfflineDb();
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState(db.consultNotes);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setTranscript(db.consultNotes);
  }, [db.consultNotes]);
  const [found, setFound] = useState<string[]>([]);
  const [form, setForm] = useState({
    medicine: "Atorvastatin 20mg",
    dosage: "20 mg",
    frequency: "Once daily (night)",
    duration: "60 days",
  });
  const [signed, setSigned] = useState<string | null>(null);

  const scribe = (kind: "bp" | "normal") => {
    setRecording(true);
    const text =
      kind === "bp"
        ? "Ambient transcript — Patient seated. Blood pressure measured at 138 over 88 mmHg, elevated from last visit. Heart rate 84 bpm. Temperature 99.1 F. Impression: hypertension not fully controlled. Plan: continue Amlodipine, add statin therapy, review in 30 days."
        : "Ambient transcript — Routine consultation. Patient reports no chest pain or dyspnoea. Blood pressure 118 over 76 mmHg. Heart rate 72 bpm. Temperature 98.6 F. Auscultation clear. Impression: stable. Plan: maintain current therapy.";
    window.setTimeout(() => {
      setTranscript(text);
      update((d) => ({
        ...d,
        consultNotes: text,
        vitals:
          kind === "bp"
            ? {
                ...d.vitals,
                bloodPressure: "138/88 mmHg",
                heartRate: "84 bpm",
                temperature: "99.1 °F",
              }
            : {
                ...d.vitals,
                bloodPressure: "118/76 mmHg",
                heartRate: "72 bpm",
                temperature: "98.6 °F",
              },
      }));
      log(`On-device scribe committed ${kind === "bp" ? "hypertension" : "routine"} chart`);
      setRecording(false);
    }, 1500);
  };

  const scan = () => {
    setScanning(true);
    setFound([]);
    mockDevices.forEach((d, i) =>
      window.setTimeout(
        () => {
          setFound((f) => [...f, d]);
          if (i === mockDevices.length - 1) setScanning(false);
        },
        500 * (i + 1),
      ),
    );
  };

  const sign = async () => {
    const id = `RX-${window.crypto.randomUUID()}`;
    const issuedAtISO = new Date().toISOString();
    const payload = {
      id,
      patientId: db.patient.id,
      medicine: form.medicine,
      dosage: form.dosage,
      frequency: form.frequency,
      duration: form.duration,
      prescriberId: "DOC-001",
      hospital: "City General Hospital",
      issuedAtISO,
    };
    const signedPayload = await signPrescriptionPayload(payload);
    update((d) => ({
      ...d,
      prescriptions: [
        ...d.prescriptions,
        {
          id,
          medicine: form.medicine,
          dosage: form.dosage,
          frequency: form.frequency,
          duration: form.duration,
          prescriber: "Dr. Barker",
          prescriberId: "DOC-001",
          hospital: "City General Hospital",
          issued: issuedAtISO.slice(0, 10),
          issuedAtISO,
          status: "Dispensation Pending",
          ...signedPayload,
          patientId: db.patient.id,
        },
      ],
    }));
    log(`${id} signed on-device and pushed to local pharmacy queue`);
    setSigned(`${id} · ${signedPayload.signature}`);
  };

  return (
    <PortalShell
      title="Doctor Clinical Workstation"
      subtitle={`Active Consultation Record: ${db.patient.name} (${db.patient.id}) · Dr. Barker · City General Hospital`}
      nav={[
        { label: "Ambient Scribe", id: "scribe" },
        { label: "Peripherals", id: "peripherals" },
        { label: "Prescription", id: "rx" },
        { label: "Patient History", id: "history" },
      ]}
    >
      <label className="clinical-data block max-w-md text-navy/70">
        Active demo patient
        <select
          value={db.patient.id}
          onChange={(event) => {
            void selectPatient(event.target.value).catch((error: unknown) => {
              console.error(error);
              toast.error("Could not load this local patient record.");
            });
          }}
          className="clinical-data mt-1 w-full rounded-md border-2 border-nuit/40 bg-white px-3 py-2 text-navy"
        >
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name} · {patient.id}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-xl bg-navy p-4">
        <p className="clinical-label text-spring">ACTIVE CONSULTATION RECORD</p>
        <p className="clinical-data text-canvas">
          {db.patient.name} ({db.patient.id}) · Allergies:{" "}
          {db.patient.allergies.map((a) => a.name).join(", ")} · BP {db.vitals.bloodPressure} · HR{" "}
          {db.vitals.heartRate} · Temp {db.vitals.temperature}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SectionCard id="scribe" eyebrow="OFFLINE AI MODE" title="On-Device Voice-to-Chart Scribe">
          <div className="flex items-center gap-4">
            <span
              className={`grid size-14 place-items-center rounded-full text-2xl ${
                recording ? "animate-mesh-pulse bg-mantis" : "bg-mantis/25"
              } text-navy shadow-[0_0_30px_-6px_var(--mantis)]`}
            >
              🎙
            </span>
            <div className="flex-1">
              <Waveform active={recording} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => scribe("bp")}
              className="clinical-label rounded-lg bg-navy px-4 py-2 text-canvas hover:bg-nuit"
            >
              Mock BP Speech Scribe
            </button>
            <button
              onClick={() => scribe("normal")}
              className="clinical-label rounded-lg bg-nuit px-4 py-2 text-canvas hover:brightness-110"
            >
              Mock Normal Consultation Scribe
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(["bloodPressure", "heartRate", "temperature"] as const).map((k) => (
              <label key={k} className="clinical-data text-navy/60">
                {k.replace(/([A-Z])/g, " $1").toUpperCase()}
                <input
                  value={db.vitals[k]}
                  onChange={(e) =>
                    update((d) => ({ ...d, vitals: { ...d.vitals, [k]: e.target.value } }))
                  }
                  className="clinical-data mt-1 w-full rounded-md border-2 border-nuit/40 px-3 py-2 text-navy focus:border-pbgreen focus:outline-none"
                />
              </label>
            ))}
          </div>
          <textarea
            value={transcript}
            onChange={(e) => {
              setTranscript(e.target.value);
              update((d) => ({ ...d, consultNotes: e.target.value }));
            }}
            rows={5}
            placeholder="Structured clinical transcript will populate here…"
            className="clinical-data mt-3 w-full rounded-lg border-2 border-nuit/40 p-3 text-navy focus:border-pbgreen focus:outline-none"
          />
        </SectionCard>

        <SectionCard id="peripherals" eyebrow="BLUETOOTH" title="Hardware Peripheral Pairing">
          <button
            onClick={scan}
            className="clinical-label w-full rounded-lg bg-navy py-2 text-canvas hover:bg-nuit"
          >
            {scanning ? "Scanning local radio…" : "Scan for Peripherals"}
          </button>
          <div className="clinical-data mt-3 space-y-2">
            {found.map((d) => {
              const paired = db.pairedDevices.includes(d);
              return (
                <button
                  key={d}
                  onClick={() =>
                    update((x) => ({
                      ...x,
                      pairedDevices: paired
                        ? x.pairedDevices.filter((p) => p !== d)
                        : [...x.pairedDevices, d],
                    }))
                  }
                  className={`animate-fade-in flex w-full items-center justify-between rounded-md border p-2 ${
                    paired ? "border-mantis bg-mantis/15 text-pbgreen" : "border-navy/15 text-navy"
                  }`}
                >
                  <span>{d}</span>
                  <span>{paired ? "✔ Paired" : "Pair"}</span>
                </button>
              );
            })}
            {!found.length && !scanning && (
              <p className="text-navy/50">No scan run yet. Paired: {db.pairedDevices.join(", ")}</p>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard id="rx" eyebrow="E-PRESCRIPTION" title="Smart Prescription Form">
        <div className="grid gap-3 md:grid-cols-4">
          {(
            [
              ["medicine", "Medicine Name"],
              ["dosage", "Dosage"],
              ["frequency", "Frequency"],
              ["duration", "Duration"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="clinical-data text-navy/60">
              {label}
              <input
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="clinical-data mt-1 w-full rounded-md border-2 border-nuit/40 px-3 py-2 text-navy focus:border-pbgreen focus:outline-none"
              />
            </label>
          ))}
        </div>
        <button
          onClick={() => void sign()}
          className="clinical-label mt-4 rounded-lg bg-pbgreen px-6 py-3 font-bold text-canvas hover:brightness-110"
        >
          🔐 Approve & Sign Electronically
        </button>
        {signed && (
          <div className="animate-fade-in mt-4 rounded-lg border-2 border-mantis bg-mantis/15 p-4">
            <p className="clinical-label text-pbgreen">🔑 Local signature applied</p>
            <p className="clinical-data text-navy">{signed}</p>
            <p className="clinical-data text-navy/60">
              Pushed to the local pharmacy queue on this node for verification and dispense.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard id="history" title="Patient Local History Cache">
        <table className="clinical-data w-full text-left">
          <thead className="text-navy/50">
            <tr>
              <th className="py-1">Hospital</th>
              <th>Date</th>
              <th>Doctor</th>
              <th>Diagnosis</th>
            </tr>
          </thead>
          <tbody>
            {db.records.map((r) => (
              <tr key={r.id} className="border-t border-navy/10 text-navy">
                <td className="py-2">{r.hospital}</td>
                <td>{r.date}</td>
                <td>{r.doctor}</td>
                <td className="text-pbgreen">{r.diagnosis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </PortalShell>
  );
}
