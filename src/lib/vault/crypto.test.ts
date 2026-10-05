import { afterEach, describe, expect, it } from "vitest";
import {
  signPrescriptionPayload,
  verifyPrescriptionPayload,
  type PrescriptionPayload,
} from "./crypto";

const values = new Map<string, string>();

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    crypto: globalThis.crypto,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  },
});

const payload: PrescriptionPayload = {
  id: "RX-TEST",
  patientId: "PAT-TEST",
  medicine: "Demo medicine",
  dosage: "10 mg",
  frequency: "Once daily",
  duration: "7 days",
  prescriberId: "DOC-TEST",
  hospital: "Demo clinic",
  issuedAtISO: "2026-10-05T00:00:00.000Z",
};

afterEach(() => values.clear());

describe("prescription signatures", () => {
  it("verifies an unchanged signed payload", async () => {
    const signed = await signPrescriptionPayload(payload);
    await expect(verifyPrescriptionPayload(payload, signed)).resolves.toBe(true);
  });

  it("rejects a changed payload", async () => {
    const signed = await signPrescriptionPayload(payload);
    await expect(
      verifyPrescriptionPayload({ ...payload, medicine: "Changed medicine" }, signed),
    ).resolves.toBe(false);
  });

  it("rejects a changed signature", async () => {
    const signed = await signPrescriptionPayload(payload);
    const alteredSignature = `${signed.signature[0] === "A" ? "B" : "A"}${signed.signature.slice(1)}`;
    await expect(
      verifyPrescriptionPayload(payload, { ...signed, signature: alteredSignature }),
    ).resolves.toBe(false);
  });
});
