import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  AlreadyDispensedError,
  dispensePrescription,
  MediSyncDb,
  type PrescriptionRow,
} from "./db";

let databaseNumber = 0;
const openDatabases: MediSyncDb[] = [];

function createDatabase(): MediSyncDb {
  const database = new MediSyncDb(`medisync-dispense-test-${databaseNumber++}`);
  openDatabases.push(database);
  return database;
}

const prescription: PrescriptionRow = {
  id: "RX-TEST",
  patientId: "PAT-TEST",
  medicine: "Demo medicine",
  dosage: "10 mg",
  frequency: "Once daily",
  duration: "7 days",
  prescriberId: "DOC-001",
  hospital: "Demo clinic",
  issuedAtISO: "2026-10-05T00:00:00.000Z",
  status: "issued",
  payloadHash: "demo",
  signature: "demo",
};

afterEach(async () => {
  await Promise.all(
    openDatabases.splice(0).map(async (database) => {
      await database.delete();
    }),
  );
});

describe("atomic prescription dispensing", () => {
  it("rejects a second dispense and writes one audit event", async () => {
    const database = createDatabase();
    await database.prescriptions.put(prescription);

    const dispensed = await dispensePrescription(prescription.id, "PH-04", database);
    expect(dispensed.status).toBe("dispensed");
    expect(dispensed.dispensedAtISO).toBeTruthy();
    expect(dispensed.dispensedBy).toBe("PH-04");
    await expect(dispensePrescription(prescription.id, "PH-04", database)).rejects.toBeInstanceOf(
      AlreadyDispensedError,
    );
    await expect(database.audit.count()).resolves.toBe(1);
  });

  it("allows exactly one of two concurrent dispense attempts", async () => {
    const database = createDatabase();
    await database.prescriptions.put(prescription);

    const outcomes = await Promise.allSettled([
      dispensePrescription(prescription.id, "PH-A", database),
      dispensePrescription(prescription.id, "PH-B", database),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
      AlreadyDispensedError,
    );
    await expect(database.audit.count()).resolves.toBe(1);
  });
});
