import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  addAuditEntry,
  db as vaultDb,
  ensureSeeded,
  getPatientSnapshot,
  getPatients,
  hashPin,
  LEGACY_KEY,
  prescriptionPayload,
  searchPatients,
  AlreadyDispensedError,
  dispensePrescription,
} from "@/lib/vault/db";
import { verifyPrescriptionPayload, type DemoPublicKey } from "@/lib/vault/crypto";
import { publishVaultChange, subscribeToVaultChanges } from "@/lib/vault/sync";
import type { PatientRow } from "@/lib/vault/db";

export type Prescription = {
  id: string;
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescriber: string;
  hospital: string;
  issued: string;
  status: "Dispensation Pending" | "Dispensed & Vault Locked";
  signature: string;
  payloadHash?: string;
  patientId?: string;
  prescriberId?: string;
  issuedAtISO?: string;
  prescriberKeyId?: string;
  prescriberPublicKey?: DemoPublicKey;
  demoLabel?: string;
  dispensedAtISO?: string;
  dispensedBy?: string;
  bleReceived?: boolean;
};

export type MedicalRecord = {
  id: string;
  hospital: string;
  department: string;
  date: string;
  doctor: string;
  symptoms: string;
  diagnosis: string;
  treatment: string;
};

export type Vitals = {
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  spo2: string;
};

export type DbShape = {
  patient: {
    name: string;
    id: string;
    mobile: string;
    pin: string;
    pinHash?: string;
    pinSalt?: string;
    abha: string;
    bloodGroup: string;
    age: number;
    allergies: { name: string; severity: string }[];
  };
  records: MedicalRecord[];
  vitals: Vitals;
  prescriptions: Prescription[];
  consultNotes: string;
  diagnosticCache: { symptom: string; at: string }[];
  syncLog: { message: string; at: string }[];
  pairedDevices: string[];
  emergencyBypass: boolean;
};

const STORAGE_KEY = "medisync.sqlite.local.v1";

const seed: DbShape = {
  patient: {
    name: "Elena Rostova",
    id: "PAT-99203",
    mobile: "9876543210",
    pin: "1234",
    abha: "91-0000-0000-0001",
    bloodGroup: "O+",
    age: 47,
    allergies: [
      { name: "Penicillin", severity: "High Severity" },
      { name: "Sulfa Drugs", severity: "Moderate" },
    ],
  },
  records: [
    {
      id: "REC-8801",
      hospital: "City General Hospital",
      department: "Cardiology Consultation",
      date: "July 2026",
      doctor: "Dr. Barker",
      symptoms: "Intermittent chest tightness, elevated resting pulse, fatigue on exertion.",
      diagnosis: "Mild Hypertension",
      treatment: "Amlodipine 10mg once daily; sodium-restricted diet; 30-day BP journal.",
    },
    {
      id: "REC-8722",
      hospital: "St. Jude Clinic",
      department: "General Medicine Checkup",
      date: "May 2026",
      doctor: "Dr. Elena",
      symptoms: "Persistent dry cough, low-grade fever, chest congestion.",
      diagnosis: "Respiratory Infection",
      treatment: "Respiratory Infection protocol — 5-day antibiotic course, steam therapy, rest.",
    },
  ],
  vitals: {
    bloodPressure: "118/76 mmHg",
    heartRate: "72 bpm",
    temperature: "98.6 °F",
    spo2: "98 %",
  },
  prescriptions: [
    {
      id: "RX-101",
      medicine: "Amlodipine 10mg",
      dosage: "10 mg",
      frequency: "Once daily (morning)",
      duration: "30 days",
      prescriber: "Dr. Barker",
      hospital: "City General Hospital",
      issued: "2026-07-14",
      status: "Dispensation Pending",
      signature: "SIG-9F2A-CBD1-7741",
      patientId: "PAT-99203",
      prescriberId: "DOC-001",
      issuedAtISO: "2026-07-14T09:00:00.000Z",
    },
    {
      id: "RX-102",
      medicine: "Lisinopril 10mg",
      dosage: "10 mg",
      frequency: "Once daily (night)",
      duration: "30 days",
      prescriber: "Dr. Barker",
      hospital: "City General Hospital",
      issued: "2026-07-14",
      status: "Dispensation Pending",
      signature: "SIG-4B77-0E93-2210",
      patientId: "PAT-99203",
      prescriberId: "DOC-001",
      issuedAtISO: "2026-07-14T09:05:00.000Z",
    },
  ],
  consultNotes: "",
  diagnosticCache: [],
  syncLog: [],
  pairedDevices: ["Omron BP Monitor M7 (BLE)"],
  emergencyBypass: false,
};

type Ctx = {
  db: DbShape;
  patients: PatientRow[];
  update: (fn: (draft: DbShape) => DbShape) => void;
  log: (message: string) => void;
  resetDb: () => void;
  refresh: () => Promise<void>;
  selectPatient: (patientId: string) => Promise<void>;
};

const OfflineDatabaseContext = createContext<Ctx | null>(null);
const ACTIVE_PATIENT_KEY = "medisync.active-patient.v1";

const toLegacySnapshot = async (patientId = "PAT-99203"): Promise<DbShape> => {
  const snapshot = await getPatientSnapshot(patientId);
  const patientRow = snapshot?.patient ?? {
    id: seed.patient.id,
    name: seed.patient.name,
    phone: seed.patient.mobile,
    abha: seed.patient.abha,
    bloodGroup: seed.patient.bloodGroup,
    age: seed.patient.age,
    allergies: seed.patient.allergies,
    pinHash: "",
    pinSalt: "",
    createdAtISO: new Date().toISOString(),
  };
  const vitals = snapshot?.vitals ?? {
    id: "",
    patientId: patientRow.id,
    recordedAtISO: "",
    bp: seed.vitals.bloodPressure,
    hr: seed.vitals.heartRate,
    temp: seed.vitals.temperature,
    spo2: seed.vitals.spo2,
  };

  return {
    patient: {
      ...seed.patient,
      name: patientRow.name,
      id: patientRow.id,
      mobile: patientRow.phone,
      abha: patientRow.abha,
      bloodGroup: patientRow.bloodGroup,
      age: patientRow.age,
      pinHash: patientRow.pinHash,
      pinSalt: patientRow.pinSalt,
      pin: "1234",
      allergies: patientRow.allergies.map((a) => ({ name: a.name, severity: a.severity })),
    },
    records: (snapshot?.records ?? []).map((r) => ({
      id: r.id,
      hospital: r.hospital,
      department: r.department,
      date: new Date(r.dateISO).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      doctor: r.doctor,
      symptoms: r.symptoms,
      diagnosis: r.diagnosis,
      treatment: r.treatment,
    })),
    vitals: {
      bloodPressure: vitals.bp ? `${vitals.bp} mmHg` : seed.vitals.bloodPressure,
      heartRate: vitals.hr ? `${vitals.hr} bpm` : seed.vitals.heartRate,
      temperature: vitals.temp ? `${vitals.temp} °F` : seed.vitals.temperature,
      spo2: vitals.spo2 ? `${vitals.spo2} %` : seed.vitals.spo2,
    },
    prescriptions: (snapshot?.prescriptions ?? []).map((p) => ({
      id: p.id,
      medicine: p.medicine,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      prescriber: p.prescriberId === "DOC-001" ? "Dr. Barker" : p.prescriberId,
      hospital: p.hospital,
      issued: new Date(p.issuedAtISO).toISOString().slice(0, 10),
      status: p.status === "dispensed" ? "Dispensed & Vault Locked" : "Dispensation Pending",
      payloadHash: p.payloadHash,
      signature: p.signature,
      patientId: p.patientId,
      prescriberId: p.prescriberId,
      issuedAtISO: p.issuedAtISO,
      prescriberKeyId: p.prescriberKeyId,
      prescriberPublicKey: p.prescriberPublicKey,
      demoLabel: p.demoLabel,
      dispensedAtISO: p.dispensedAtISO,
      dispensedBy: p.dispensedBy,
    })),
    consultNotes: "",
    diagnosticCache: [],
    syncLog: [],
    pairedDevices: ["Omron BP Monitor M7 (BLE)"],
    emergencyBypass: false,
  };
};

const migrateLegacyData = async () => {
  if (typeof window === "undefined") return;
  const migrated = window.localStorage.getItem("medisync-vault-migrated");
  if (migrated === "1") return;
  const raw = window.localStorage.getItem(LEGACY_KEY);
  if (!raw) {
    window.localStorage.setItem("medisync-vault-migrated", "1");
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    if (!parsed.patient) {
      window.localStorage.removeItem(LEGACY_KEY);
      window.localStorage.setItem("medisync-vault-migrated", "1");
      return;
    }

    await vaultDb.transaction(
      "rw",
      vaultDb.patients,
      vaultDb.records,
      vaultDb.vitals,
      vaultDb.prescriptions,
      async () => {
        await vaultDb.patients.put({
          id: parsed.patient.id,
          name: parsed.patient.name,
          phone: parsed.patient.mobile,
          abha: parsed.patient.abha,
          bloodGroup: parsed.patient.bloodGroup,
          age: parsed.patient.age,
          allergies: parsed.patient.allergies,
          pinHash: await hashPin(parsed.patient.pin || "1234", "legacy-salt"),
          pinSalt: "legacy-salt",
          createdAtISO: new Date().toISOString(),
        });
        for (const record of parsed.records ?? []) {
          await vaultDb.records.put({
            id: record.id,
            patientId: parsed.patient.id,
            hospital: record.hospital,
            department: record.department,
            dateISO: new Date(record.date).toISOString(),
            doctor: record.doctor,
            symptoms: record.symptoms,
            diagnosis: record.diagnosis,
            treatment: record.treatment,
          });
        }
        await vaultDb.vitals.put({
          id: `legacy-${parsed.patient.id}`,
          patientId: parsed.patient.id,
          recordedAtISO: new Date().toISOString(),
          bp: parsed.vitals.bloodPressure.replace(/\D/g, "") || "118/76",
          hr: parsed.vitals.heartRate.replace(/\D/g, "") || "72",
          temp: parsed.vitals.temperature.replace(/\D/g, "") || "98.6",
          spo2: parsed.vitals.spo2.replace(/\D/g, "") || "98",
        });
        for (const prescription of parsed.prescriptions ?? []) {
          await vaultDb.prescriptions.put({
            id: prescription.id,
            patientId: parsed.patient.id,
            medicine: prescription.medicine,
            dosage: prescription.dosage,
            frequency: prescription.frequency,
            duration: prescription.duration,
            prescriberId: prescription.prescriber,
            hospital: prescription.hospital,
            issuedAtISO: new Date(prescription.issued).toISOString(),
            status: prescription.status === "Dispensed & Vault Locked" ? "dispensed" : "issued",
            payloadHash: `legacy-${prescription.id}`,
            signature: prescription.signature,
            prescriberKeyId: "",
          });
        }
      },
    );

    window.localStorage.removeItem(LEGACY_KEY);
    window.localStorage.setItem("medisync-vault-migrated", "1");
  } catch (error) {
    console.error(error);
    toast.error("Storage migration failed. Local data may be unavailable.");
    throw error;
  }
};

export function OfflineDatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DbShape>(seed);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [activePatientId, setActivePatientId] = useState("PAT-99203");

  const hydrate = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await ensureSeeded();
      await migrateLegacyData();
      const patientRows = await getPatients();
      const storedPatientId = window.localStorage.getItem(ACTIVE_PATIENT_KEY);
      const nextPatientId = patientRows.some((patient) => patient.id === storedPatientId)
        ? storedPatientId!
        : "PAT-99203";
      setPatients(patientRows);
      setActivePatientId(nextPatientId);
      const snapshot = await toLegacySnapshot(nextPatientId);
      setDb(snapshot);
    } catch (error) {
      console.error(error);
      toast.error("Storage error: local vault could not be loaded.");
    }
  }, []);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const [patientRows, snapshot] = await Promise.all([
      getPatients(),
      toLegacySnapshot(activePatientId),
    ]);
    setPatients(patientRows);
    setDb(snapshot);
  }, [activePatientId]);

  const selectPatient = useCallback(async (patientId: string) => {
    if (typeof window === "undefined") return;
    const exists = await vaultDb.patients.get(patientId);
    if (!exists) {
      throw new Error(`Patient ${patientId} is not available in the local vault.`);
    }
    window.localStorage.setItem(ACTIVE_PATIENT_KEY, patientId);
    setActivePatientId(patientId);
    setDb(await toLegacySnapshot(patientId));
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    return subscribeToVaultChanges((change) => {
      if (
        change === "prescription-issued" ||
        change === "prescription-dispensed" ||
        change === "patient-updated"
      ) {
        void refresh().catch((error: unknown) => {
          console.error(error);
          toast.error("Storage error: local vault could not be refreshed.");
        });
      }
    });
  }, [refresh]);

  const persistActivePatient = useCallback(async (next: DbShape, previous: DbShape) => {
    try {
      const patientRow = {
        id: next.patient.id,
        name: next.patient.name,
        phone: next.patient.mobile,
        abha: next.patient.abha,
        bloodGroup: next.patient.bloodGroup,
        age: next.patient.age,
        allergies: next.patient.allergies,
        pinHash: next.patient.pinHash || "",
        pinSalt: next.patient.pinSalt || "",
        createdAtISO: new Date().toISOString(),
      };

      const records = next.records.map((record) => ({
        id: record.id,
        patientId: next.patient.id,
        hospital: record.hospital,
        department: record.department,
        dateISO: new Date(record.date).toISOString(),
        doctor: record.doctor,
        symptoms: record.symptoms,
        diagnosis: record.diagnosis,
        treatment: record.treatment,
      }));

      await vaultDb.transaction(
        "rw",
        vaultDb.patients,
        vaultDb.records,
        vaultDb.vitals,
        vaultDb.prescriptions,
        async () => {
          await vaultDb.patients.put(patientRow);
          await vaultDb.records.where("patientId").equals(next.patient.id).delete();
          await vaultDb.records.bulkPut(records);

          const latestVitals = {
            id: `vitals-${next.patient.id}`,
            patientId: next.patient.id,
            recordedAtISO: new Date().toISOString(),
            bp: next.vitals.bloodPressure.replace(/[^0-9/]/g, "") || "118/76",
            hr: next.vitals.heartRate.replace(/[^0-9]/g, "") || "72",
            temp: next.vitals.temperature.replace(/[^0-9.]/g, "") || "98.6",
            spo2: next.vitals.spo2.replace(/[^0-9]/g, "") || "98",
          };
          await vaultDb.vitals.where("patientId").equals(next.patient.id).delete();
          await vaultDb.vitals.put(latestVitals);

          await vaultDb.prescriptions.where("patientId").equals(next.patient.id).delete();
          await vaultDb.prescriptions.bulkPut(
            next.prescriptions.map((p) => ({
              id: p.id,
              patientId: p.patientId ?? next.patient.id,
              medicine: p.medicine,
              dosage: p.dosage,
              frequency: p.frequency,
              duration: p.duration,
              prescriberId: p.prescriberId ?? "DOC-001",
              hospital: p.hospital,
              issuedAtISO: p.issuedAtISO ?? new Date(p.issued).toISOString(),
              status: p.status === "Dispensed & Vault Locked" ? "dispensed" : "issued",
              payloadHash: p.payloadHash ?? `legacy-${p.id}`,
              signature: p.signature,
              prescriberKeyId: p.prescriberKeyId,
              prescriberPublicKey: p.prescriberPublicKey,
              demoLabel: p.demoLabel,
              dispensedAtISO: p.dispensedAtISO,
              dispensedBy: p.dispensedBy,
            })),
          );
        },
      );
      await addAuditEntry(
        "local-update",
        `Saved patient snapshot for ${next.patient.id}`,
        next.patient.id,
        "local-ui",
      );
      const previousById = new Map(previous.prescriptions.map((item) => [item.id, item]));
      if (
        next.prescriptions.some(
          (item) => !previousById.has(item.id) && item.status === "Dispensation Pending",
        )
      ) {
        publishVaultChange("prescription-issued");
      }
      if (
        JSON.stringify({
          patient: next.patient,
          records: next.records,
          vitals: next.vitals,
        }) !==
        JSON.stringify({
          patient: previous.patient,
          records: previous.records,
          vitals: previous.vitals,
        })
      ) {
        publishVaultChange("patient-updated");
      }
    } catch (error) {
      console.error(error);
      toast.error("Storage error: local vault write failed.");
      throw error;
    }
  }, []);

  const update = useCallback(
    (fn: (draft: DbShape) => DbShape) => {
      setDb((prev) => {
        const next = fn(prev);
        void persistActivePatient(next, prev);
        return next;
      });
    },
    [persistActivePatient],
  );

  const log = useCallback(
    (message: string) => {
      setDb((prev) => ({
        ...prev,
        syncLog: [{ message, at: new Date().toLocaleTimeString() }, ...prev.syncLog].slice(0, 25),
      }));
      if (typeof window !== "undefined") {
        void addAuditEntry("sync-log", message, db.patient.id, "local-ui");
      }
    },
    [db.patient.id],
  );

  const resetDb = useCallback(async () => {
    try {
      await ensureSeeded();
      const snapshot = await toLegacySnapshot();
      setDb(snapshot);
      toast.success("Demo data reset");
    } catch (error) {
      console.error(error);
      toast.error("Storage error: demo reset failed.");
    }
  }, []);

  const value = useMemo(
    () => ({ db, patients, update, log, resetDb, refresh, selectPatient }),
    [db, patients, update, log, resetDb, refresh, selectPatient],
  );

  return (
    <OfflineDatabaseContext.Provider value={value}>{children}</OfflineDatabaseContext.Provider>
  );
}

export function useOfflineDb() {
  const ctx = useContext(OfflineDatabaseContext);
  if (!ctx) throw new Error("useOfflineDb must be used inside OfflineDatabaseProvider");
  return ctx;
}

export async function verifyPrescriptionSignature(prescription: Prescription) {
  if (
    !prescription.payloadHash ||
    !prescription.prescriberKeyId ||
    !prescription.prescriberPublicKey ||
    !prescription.patientId ||
    !prescription.prescriberId ||
    !prescription.issuedAtISO
  ) {
    return false;
  }

  return verifyPrescriptionPayload(
    {
      id: prescription.id,
      patientId: prescription.patientId,
      medicine: prescription.medicine,
      dosage: prescription.dosage,
      frequency: prescription.frequency,
      duration: prescription.duration,
      prescriberId: prescription.prescriberId,
      hospital: prescription.hospital,
      issuedAtISO: prescription.issuedAtISO,
    },
    {
      payloadHash: prescription.payloadHash,
      signature: prescription.signature,
      prescriberKeyId: prescription.prescriberKeyId,
      prescriberPublicKey: prescription.prescriberPublicKey,
    },
  );
}

export async function verifyLocalPin(inputPin: string, patientId: string) {
  if (typeof window === "undefined") return false;
  const patient = await vaultDb.patients.get(patientId);
  if (!patient) return false;
  const hash = await hashPin(inputPin, patient.pinSalt);
  return hash === patient.pinHash;
}

export async function searchLocalPatients(query: string) {
  await ensureSeeded();
  return searchPatients(query);
}

export { AlreadyDispensedError, dispensePrescription };

export function speak(text: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch {
    /* speech unavailable */
  }
}
