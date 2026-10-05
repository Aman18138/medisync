import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { PortalShell, SectionCard } from "@/components/shell";
import {
  AlreadyDispensedError,
  dispensePrescription,
  useOfflineDb,
  verifyPrescriptionSignature,
} from "@/lib/offline-db";

export const Route = createFileRoute("/pharmacist")({
  head: () => ({
    meta: [
      { title: "Pharmacist Dispatch Portal — MediSync" },
      {
        name: "description",
        content: "Local demo queue with cryptographically checked prescription signatures.",
      },
      { property: "og:title", content: "Pharmacist Dispatch Portal — MediSync" },
      {
        property: "og:description",
        content:
          "Local prescription dispensing with signature checks and single-dispense blocking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PharmacistPortal,
});

function PharmacistPortal() {
  const { db, patients, refresh, selectPatient } = useOfflineDb();
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verification, setVerification] = useState<"checking" | "valid" | "invalid">("checking");
  const [qrImage, setQrImage] = useState("");

  const selected = db.prescriptions.find((p) => p.id === openId) ?? null;
  const incoming = db.prescriptions.filter(
    (p) => p.bleReceived && p.status === "Dispensation Pending",
  );

  useEffect(() => {
    let current = true;
    if (!selected) return;
    setVerification("checking");
    void verifyPrescriptionSignature(selected).then((valid) => {
      if (current) setVerification(valid ? "valid" : "invalid");
    });
    return () => {
      current = false;
    };
  }, [selected]);

  useEffect(() => {
    let current = true;
    setQrImage("");
    if (!selected) return;

    const payload = {
      id: selected.id,
      patientId: selected.patientId ?? db.patient.id,
      medicine: selected.medicine,
      dosage: selected.dosage,
      frequency: selected.frequency,
      duration: selected.duration,
      prescriberId: selected.prescriberId ?? "DOC-001",
      hospital: selected.hospital,
      issuedAtISO: selected.issuedAtISO ?? `${selected.issued}T00:00:00.000Z`,
    };
    const qrText = JSON.stringify({
      id: selected.id,
      payloadHash: selected.payloadHash ?? "",
      signature: selected.signature,
      payload,
    });
    void QRCode.toDataURL(qrText, { errorCorrectionLevel: "M", margin: 1, width: 240 })
      .then((image) => {
        if (current) setQrImage(image);
      })
      .catch((error: unknown) => {
        console.error(error);
        toast.error("Prescription QR could not be generated.");
      });
    return () => {
      current = false;
    };
  }, [db.patient.id, selected]);

  const dispense = async (id: string) => {
    const target = db.prescriptions.find((p) => p.id === id);
    if (!target) return;
    if (!(await verifyPrescriptionSignature(target))) {
      setVerification("invalid");
      setNotice("Signature mismatch: dispensing is disabled for this prescription.");
      return;
    }

    try {
      await dispensePrescription(id, "PH-04");
      await refresh();
      setNotice("Dispensed successfully.");
    } catch (error) {
      if (error instanceof AlreadyDispensedError) {
        setNotice(`Double-spend blocked: ${error.message}`);
        await refresh();
        return;
      }
      console.error(error);
      toast.error("Could not dispense this prescription. No status change was confirmed.");
    }
  };

  return (
    <PortalShell
      title="Local Demo Dispensation Queue"
      subtitle={`Pharmacy Node PH-04 · ${db.prescriptions.filter((p) => p.status === "Dispensation Pending").length} pending · ${incoming.length} new BLE tokens`}
      nav={[
        { label: "Dispatch Queue", id: "queue" },
        { label: "Vault Log", id: "vault" },
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
      {incoming.length > 0 && (
        <div className="rounded-xl bg-spring p-3">
          <p className="clinical-label text-navy">
            🔔 {incoming.length} new incoming BLE token{incoming.length > 1 ? "s" : ""}:{" "}
            {incoming.map((p) => p.id).join(", ")}
          </p>
        </div>
      )}

      <SectionCard id="queue" eyebrow="LOCAL DATABASE" title="Prescription Dispatch Queue">
        <table className="clinical-data w-full text-left">
          <thead className="text-navy/50">
            <tr>
              <th className="py-2">Token ID</th>
              <th>Patient</th>
              <th>Medicine</th>
              <th>Prescriber</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {db.prescriptions.map((p) => (
              <tr
                key={p.id}
                onClick={() => {
                  setOpenId(p.id);
                  setNotice(null);
                }}
                className="cursor-pointer border-t border-navy/10 text-navy hover:bg-canvas"
              >
                <td className="py-2 font-bold">{p.id}</td>
                <td>{db.patient.name}</td>
                <td>{p.medicine}</td>
                <td>{p.prescriber}</td>
                <td>
                  <span
                    className={`rounded-full px-3 py-1 ${
                      p.status === "Dispensation Pending"
                        ? "bg-nuit/15 text-nuit"
                        : "bg-mantis text-navy font-bold"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard id="vault" title="Local Vault Sync Log">
        <ul className="clinical-data space-y-1 text-navy/70">
          {db.syncLog.length ? (
            db.syncLog.map((l, i) => (
              <li key={i}>
                [{l.at}] {l.message}
              </li>
            ))
          ) : (
            <li>No local sync events recorded yet.</li>
          )}
        </ul>
      </SectionCard>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-navy/50"
          onClick={() => setOpenId(null)}
        >
          <div
            className="animate-fade-in h-full w-full max-w-md overflow-y-auto bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="brand-title text-xl text-navy">{selected.id}</h2>
              <button onClick={() => setOpenId(null)} className="no-print clinical-label text-nuit">
                Close ✕
              </button>
            </div>
            <dl className="clinical-data mt-4 space-y-2 text-navy">
              {[
                ["Patient", `${db.patient.name} (${db.patient.id})`],
                ["Medicine", selected.medicine],
                ["Dosage", selected.dosage],
                ["Frequency", selected.frequency],
                ["Duration", selected.duration],
                ["Prescriber", `${selected.prescriber} · ${selected.hospital}`],
                ["Issued", selected.issued],
                ["Allergy Flags", db.patient.allergies.map((a) => a.name).join(", ")],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-navy/10 pb-1">
                  <dt className="text-navy/55">{k}</dt>
                  <dd className="text-right font-bold">{v}</dd>
                </div>
              ))}
            </dl>

            <div
              className={`mt-4 rounded-lg border-2 p-3 ${
                verification === "valid" ? "border-mantis bg-mantis/12" : "border-alert bg-alert/10"
              }`}
            >
              <p
                className={`clinical-label ${
                  verification === "valid" ? "text-pbgreen" : "text-alert"
                }`}
              >
                {verification === "checking"
                  ? "Checking prescription signature…"
                  : verification === "valid"
                    ? "VERIFIED"
                    : "INVALID"}
              </p>
              <p className="clinical-data break-all text-navy">{selected.signature}</p>
              <p className="clinical-data text-navy/60">Demo keys stored locally.</p>
              {selected.demoLabel && (
                <p className="clinical-data font-bold text-alert">{selected.demoLabel}</p>
              )}
            </div>

            <article className="prescription-print hidden">
              <p className="clinical-data">Synthetic demo data. Not for clinical use.</p>
              <h1 className="brand-title mt-3 text-2xl text-navy">Prescription {selected.id}</h1>
              <p className="clinical-label mt-3">
                Signature check:{" "}
                {verification === "valid"
                  ? "VERIFIED"
                  : verification === "invalid"
                    ? "INVALID"
                    : "CHECKING"}
              </p>
              <dl className="clinical-data mt-5 grid grid-cols-2 gap-3">
                {[
                  ["Patient", `${db.patient.name} (${db.patient.id})`],
                  ["Medicine", selected.medicine],
                  ["Dosage", selected.dosage],
                  ["Frequency", selected.frequency],
                  ["Duration", selected.duration],
                  ["Prescriber", selected.prescriber],
                  ["Hospital", selected.hospital],
                  ["Issued", selected.issued],
                  ["Payload hash", selected.payloadHash ?? "None recorded"],
                  ["Signature", selected.signature],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-bold">{label}</dt>
                    <dd className="break-all">{value}</dd>
                  </div>
                ))}
              </dl>
              {qrImage && (
                <img className="mt-6 size-48" src={qrImage} alt={`QR token for ${selected.id}`} />
              )}
              <p className="clinical-data mt-6">
                This is a synthetic demo prescription, not a clinical order.
              </p>
            </article>

            <button
              onClick={() => window.print()}
              disabled={!qrImage}
              className="no-print clinical-label mt-5 w-full rounded-lg border border-navy/25 py-3 font-bold text-navy disabled:opacity-50"
            >
              Print prescription
            </button>

            {selected.status === "Dispensation Pending" ? (
              <button
                onClick={() => void dispense(selected.id)}
                disabled={verification !== "valid"}
                className="clinical-label mt-5 w-full rounded-lg bg-pbgreen py-3 text-lg font-bold text-canvas hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dispense & Lock Prescription
              </button>
            ) : (
              <p className="clinical-label mt-5 rounded-lg bg-mantis p-3 text-center font-bold text-navy">
                Marked dispensed in this local demo.
              </p>
            )}

            {notice && (
              <p className="clinical-data animate-fade-in mt-3 rounded-lg bg-navy p-3 text-mantis">
                {notice}
              </p>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
