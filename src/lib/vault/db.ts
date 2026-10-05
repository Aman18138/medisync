import Dexie, { type Table } from "dexie";
import {
  signPrescriptionPayload,
  type DemoPublicKey,
  type PrescriptionPayload,
} from "@/lib/vault/crypto";
import { publishVaultChange } from "@/lib/vault/sync";

export type AllergyEntry = {
  name: string;
  severity: string;
};

export type PatientRow = {
  id: string;
  name: string;
  phone: string;
  abha: string;
  bloodGroup: string;
  age: number;
  allergies: AllergyEntry[];
  pinHash: string;
  pinSalt: string;
  createdAtISO: string;
};

export type RecordRow = {
  id: string;
  patientId: string;
  hospital: string;
  department: string;
  dateISO: string;
  doctor: string;
  symptoms: string;
  diagnosis: string;
  treatment: string;
};

export type VitalsRow = {
  id: string;
  patientId: string;
  recordedAtISO: string;
  bp: string;
  hr: string;
  temp: string;
  spo2: string;
};

export type PrescriptionRow = {
  id: string;
  patientId: string;
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescriberId: string;
  hospital: string;
  issuedAtISO: string;
  status: "issued" | "dispensed";
  payloadHash: string;
  signature: string;
  prescriberKeyId?: string;
  prescriberPublicKey?: DemoPublicKey;
  demoLabel?: string;
  dispensedAtISO?: string;
  dispensedBy?: string;
};

export type DoctorRow = {
  id: string;
  name: string;
  role: "doctor";
  pinHash: string;
  pinSalt: string;
  createdAtISO: string;
};

export type PharmacistRow = {
  id: string;
  name: string;
  role: "pharmacist";
  pinHash: string;
  pinSalt: string;
  createdAtISO: string;
};

export type BodyMarkRow = {
  id: string;
  patientId: string;
  visitId?: string;
  regionId: string;
  view: "front" | "back";
  type: string;
  severity: number;
  duration: string;
  createdAtISO: string;
};

export type AuditRow = {
  id: string;
  atISO: string;
  action: string;
  patientId?: string;
  actor: string;
  detail: string;
};

export type MetaRow = {
  key: string;
  value: string;
};

export class MediSyncDb extends Dexie {
  patients!: Table<PatientRow, string>;
  records!: Table<RecordRow, string>;
  vitals!: Table<VitalsRow, string>;
  prescriptions!: Table<PrescriptionRow, string>;
  doctors!: Table<DoctorRow, string>;
  pharmacists!: Table<PharmacistRow, string>;
  bodyMarks!: Table<BodyMarkRow, string>;
  audit!: Table<AuditRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = "medisync-local-vault") {
    super(name);
    this.version(1).stores({
      patients: "id, phone, abha, name",
      records: "id, patientId, dateISO",
      vitals: "id, patientId, recordedAtISO",
      prescriptions: "id, patientId, status, prescriberId, issuedAtISO",
      doctors: "id, name, role",
      pharmacists: "id, name, role",
      bodyMarks: "id, patientId, visitId, regionId",
      audit: "id, atISO, patientId, action",
      meta: "key",
    });
  }
}

export class AlreadyDispensedError extends Error {
  constructor(prescriptionId: string) {
    super(`Prescription ${prescriptionId} has already been dispensed.`);
    this.name = "AlreadyDispensedError";
  }
}

export const db = new MediSyncDb();
export const SEED_VERSION_KEY = "medisync.seed.v2";
export const LEGACY_KEY = "medisync.sqlite.local.v1";

const hashText = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const makeSalt = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const hashPin = async (pin: string, salt: string) => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${pin}:${salt}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 120000,
    },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export function prescriptionPayload(
  prescription: Pick<
    PrescriptionRow,
    | "id"
    | "patientId"
    | "medicine"
    | "dosage"
    | "frequency"
    | "duration"
    | "prescriberId"
    | "hospital"
    | "issuedAtISO"
  >,
): PrescriptionPayload {
  return {
    id: prescription.id,
    patientId: prescription.patientId,
    medicine: prescription.medicine,
    dosage: prescription.dosage,
    frequency: prescription.frequency,
    duration: prescription.duration,
    prescriberId: prescription.prescriberId,
    hospital: prescription.hospital,
    issuedAtISO: prescription.issuedAtISO,
  };
}

const demoPatients: Array<{
  row: PatientRow;
  records: RecordRow[];
  vitals: VitalsRow[];
  prescriptions: PrescriptionRow[];
}> = [
  {
    row: {
      id: "PAT-99203",
      name: "Elena Rostova",
      phone: "9876543210",
      abha: "91-0000-0000-0001",
      bloodGroup: "O+",
      age: 47,
      allergies: [
        { name: "Penicillin", severity: "High" },
        { name: "Sulfa Drugs", severity: "Moderate" },
      ],
      pinHash: "",
      pinSalt: "",
      createdAtISO: "2026-01-12T09:00:00.000Z",
    },
    records: [
      {
        id: "REC-8801",
        patientId: "PAT-99203",
        hospital: "City General Hospital",
        department: "Cardiology Consultation",
        dateISO: "2026-07-14T00:00:00.000Z",
        doctor: "Dr. Barker",
        symptoms: "Intermittent chest tightness, elevated resting pulse, fatigue on exertion.",
        diagnosis: "Mild Hypertension",
        treatment: "Amlodipine 10mg once daily; sodium-restricted diet; 30-day BP journal.",
      },
      {
        id: "REC-8722",
        patientId: "PAT-99203",
        hospital: "St. Jude Clinic",
        department: "General Medicine Checkup",
        dateISO: "2026-05-14T00:00:00.000Z",
        doctor: "Dr. Elena",
        symptoms: "Persistent dry cough, low-grade fever, chest congestion.",
        diagnosis: "Respiratory Infection",
        treatment: "Respiratory Infection protocol — 5-day antibiotic course, steam therapy, rest.",
      },
    ],
    vitals: [
      {
        id: "VIT-01",
        patientId: "PAT-99203",
        recordedAtISO: "2026-07-14T08:30:00.000Z",
        bp: "118/76",
        hr: "72",
        temp: "98.6",
        spo2: "98",
      },
    ],
    prescriptions: [
      {
        id: "RX-101",
        patientId: "PAT-99203",
        medicine: "Amlodipine 10mg",
        dosage: "10 mg",
        frequency: "Once daily",
        duration: "30 days",
        prescriberId: "DOC-001",
        hospital: "City General Hospital",
        issuedAtISO: "2026-07-14T09:00:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
      {
        id: "RX-103",
        patientId: "PAT-99203",
        medicine: "Metformin 500mg",
        dosage: "500 mg",
        frequency: "Once daily",
        duration: "30 days",
        prescriberId: "DOC-001",
        hospital: "City General Hospital",
        issuedAtISO: "2026-07-14T09:10:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
        demoLabel: "demo: tampered",
      },
      {
        id: "RX-102",
        patientId: "PAT-99203",
        medicine: "Lisinopril 10mg",
        dosage: "10 mg",
        frequency: "Once daily",
        duration: "30 days",
        prescriberId: "DOC-001",
        hospital: "City General Hospital",
        issuedAtISO: "2026-07-14T09:05:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
    ],
  },
  {
    row: {
      id: "PAT-10001",
      name: "Nadia Merz",
      phone: "9000000002",
      abha: "91-0000-0000-0002",
      bloodGroup: "A-",
      age: 32,
      allergies: [{ name: "Peanuts", severity: "High" }],
      pinHash: "",
      pinSalt: "",
      createdAtISO: "2026-02-19T10:15:00.000Z",
    },
    records: [],
    vitals: [
      {
        id: "VIT-02",
        patientId: "PAT-10001",
        recordedAtISO: "2026-02-19T11:00:00.000Z",
        bp: "126/82",
        hr: "74",
        temp: "99.0",
        spo2: "97",
      },
    ],
    prescriptions: [],
  },
  {
    row: {
      id: "PAT-10002",
      name: "Rohit Nair",
      phone: "9000000003",
      abha: "91-0000-0000-0003",
      bloodGroup: "B+",
      age: 68,
      allergies: [{ name: "Ibuprofen", severity: "Moderate" }],
      pinHash: "",
      pinSalt: "",
      createdAtISO: "2026-04-07T12:00:00.000Z",
    },
    records: [],
    vitals: [
      {
        id: "VIT-03",
        patientId: "PAT-10002",
        recordedAtISO: "2026-04-07T12:15:00.000Z",
        bp: "142/88",
        hr: "78",
        temp: "98.8",
        spo2: "96",
      },
    ],
    prescriptions: [
      {
        id: "RX-201",
        patientId: "PAT-10002",
        medicine: "Metformin 500mg",
        dosage: "500 mg",
        frequency: "Twice daily",
        duration: "90 days",
        prescriberId: "DOC-002",
        hospital: "Northside Clinic",
        issuedAtISO: "2026-04-07T12:20:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
      {
        id: "RX-202",
        patientId: "PAT-10002",
        medicine: "Atorvastatin 20mg",
        dosage: "20 mg",
        frequency: "Once daily",
        duration: "60 days",
        prescriberId: "DOC-002",
        hospital: "Northside Clinic",
        issuedAtISO: "2026-04-07T12:22:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
      {
        id: "RX-203",
        patientId: "PAT-10002",
        medicine: "Vitamin D3",
        dosage: "1000 IU",
        frequency: "Once daily",
        duration: "30 days",
        prescriberId: "DOC-002",
        hospital: "Northside Clinic",
        issuedAtISO: "2026-04-07T12:24:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
      {
        id: "RX-204",
        patientId: "PAT-10002",
        medicine: "Aspirin 75mg",
        dosage: "75 mg",
        frequency: "Once daily",
        duration: "30 days",
        prescriberId: "DOC-001",
        hospital: "Northside Clinic",
        issuedAtISO: "2026-04-07T12:26:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
      {
        id: "RX-205",
        patientId: "PAT-10002",
        medicine: "Amlodipine 10mg",
        dosage: "10 mg",
        frequency: "Once daily",
        duration: "30 days",
        prescriberId: "DOC-001",
        hospital: "Northside Clinic",
        issuedAtISO: "2026-04-07T12:28:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
      {
        id: "RX-206",
        patientId: "PAT-10002",
        medicine: "Lisinopril 10mg",
        dosage: "10 mg",
        frequency: "Once daily",
        duration: "30 days",
        prescriberId: "DOC-001",
        hospital: "Northside Clinic",
        issuedAtISO: "2026-04-07T12:30:00.000Z",
        status: "issued",
        payloadHash: "",
        signature: "",
      },
    ],
  },
  {
    row: {
      id: "PAT-10003",
      name: "Aarav Shah",
      phone: "9000000004",
      abha: "91-0000-0000-0004",
      bloodGroup: "AB+",
      age: 24,
      allergies: [],
      pinHash: "",
      pinSalt: "",
      createdAtISO: "2026-05-09T15:45:00.000Z",
    },
    records: [],
    vitals: [],
    prescriptions: [],
  },
  {
    row: {
      id: "PAT-10004",
      name: "Elena Ross",
      phone: "9876543211",
      abha: "91-0000-0000-0005",
      bloodGroup: "O-",
      age: 51,
      allergies: [{ name: "Latex", severity: "Moderate" }],
      pinHash: "",
      pinSalt: "",
      createdAtISO: "2026-06-23T09:20:00.000Z",
    },
    records: [],
    vitals: [],
    prescriptions: [],
  },
];

export async function ensureSeeded() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_VERSION_KEY) === "1") return;

  const patientRows = await Promise.all(
    demoPatients.map(async (entry) => {
      const pinSalt = makeSalt();
      const pinHash = await hashPin("1234", pinSalt);
      return {
        ...entry.row,
        pinHash,
        pinSalt,
      };
    }),
  );

  await db.transaction(
    "rw",
    db.patients,
    db.records,
    db.vitals,
    db.prescriptions,
    db.doctors,
    db.pharmacists,
    db.audit,
    db.meta,
    async () => {
      await db.patients.clear();
      await db.records.clear();
      await db.vitals.clear();
      await db.prescriptions.clear();
      await db.doctors.clear();
      await db.pharmacists.clear();
      await db.audit.clear();
      await db.meta.clear();
      await db.patients.bulkPut(patientRows);
      for (const patient of demoPatients) {
        await db.records.bulkPut(patient.records);
        await db.vitals.bulkPut(patient.vitals);
        const signedPrescriptions = await Promise.all(
          patient.prescriptions.map(async (prescription) => {
            const signed = await signPrescriptionPayload(prescriptionPayload(prescription));
            return {
              ...prescription,
              ...signed,
              medicine: prescription.demoLabel ? "Tampered demo medicine" : prescription.medicine,
            };
          }),
        );
        await db.prescriptions.bulkPut(signedPrescriptions);
      }
      await db.doctors.bulkPut([
        {
          id: "DOC-001",
          name: "Dr. Barker",
          role: "doctor",
          pinHash: await hashPin("1234", "doctor-barker"),
          pinSalt: "doctor-barker",
          createdAtISO: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "DOC-002",
          name: "Dr. Elena",
          role: "doctor",
          pinHash: await hashPin("1234", "doctor-elena"),
          pinSalt: "doctor-elena",
          createdAtISO: "2026-01-01T00:00:00.000Z",
        },
      ]);
      await db.pharmacists.bulkPut([
        {
          id: "PH-04",
          name: "Pharmacist Node 04",
          role: "pharmacist",
          pinHash: await hashPin("1234", "pharm-04"),
          pinSalt: "pharm-04",
          createdAtISO: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "PH-09",
          name: "Pharmacist Node 09",
          role: "pharmacist",
          pinHash: await hashPin("1234", "pharm-09"),
          pinSalt: "pharm-09",
          createdAtISO: "2026-01-01T00:00:00.000Z",
        },
      ]);
      await db.meta.put({ key: "seed", value: "1" });
    },
  );

  window.localStorage.setItem(SEED_VERSION_KEY, "1");
}

export const patientMatchesQuery = (patient: PatientRow, query: string) => {
  const normalized = query.toLowerCase();
  return [patient.id, patient.name, patient.phone, patient.abha].some((field) =>
    field.toLowerCase().includes(normalized),
  );
};

export async function searchPatients(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return db.patients.filter((patient) => patientMatchesQuery(patient, trimmed)).toArray();
}

export async function getPatients() {
  return db.patients.orderBy("name").toArray();
}

export async function getPatientSnapshot(patientId: string) {
  const patient = await db.patients.get(patientId);
  if (!patient) return null;
  const records = await db.records.where("patientId").equals(patientId).sortBy("dateISO");
  const vitals = await db.vitals.where("patientId").equals(patientId).sortBy("recordedAtISO");
  const prescriptions = await db.prescriptions
    .where("patientId")
    .equals(patientId)
    .sortBy("issuedAtISO");
  const latestVitals = vitals.at(-1) ?? {
    id: "",
    patientId,
    recordedAtISO: "",
    bp: "N/A",
    hr: "N/A",
    temp: "N/A",
    spo2: "N/A",
  };

  return {
    patient,
    records,
    vitals: latestVitals,
    prescriptions,
  };
}

export async function addAuditEntry(
  action: string,
  detail: string,
  patientId?: string,
  actor = "system",
) {
  await db.audit.put({
    id: crypto.randomUUID(),
    atISO: new Date().toISOString(),
    action,
    patientId,
    actor,
    detail,
  });
}

export async function dispensePrescription(
  prescriptionId: string,
  dispenserId: string,
  database: MediSyncDb = db,
): Promise<PrescriptionRow> {
  const dispensed = await database.transaction(
    "rw",
    database.prescriptions,
    database.audit,
    async () => {
      const prescription = await database.prescriptions.get(prescriptionId);
      if (!prescription || prescription.status !== "issued") {
        throw new AlreadyDispensedError(prescriptionId);
      }

      const dispensedAtISO = new Date().toISOString();
      const dispensed: PrescriptionRow = {
        ...prescription,
        status: "dispensed",
        dispensedAtISO,
        dispensedBy: dispenserId,
      };
      await database.prescriptions.put(dispensed);
      await database.audit.put({
        id: crypto.randomUUID(),
        atISO: dispensedAtISO,
        action: "prescription-dispensed",
        patientId: prescription.patientId,
        actor: dispenserId,
        detail: `Dispensed prescription ${prescriptionId}`,
      });
      return dispensed;
    },
  );
  publishVaultChange("prescription-dispensed");
  return dispensed;
}
