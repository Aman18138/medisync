export type PrescriptionPayload = {
  id: string;
  patientId: string;
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescriberId: string;
  hospital: string;
  issuedAtISO: string;
};

export type DemoPublicKey = JsonWebKey;

export type SignedPayload = {
  payloadHash: string;
  signature: string;
  prescriberKeyId: string;
  prescriberPublicKey: DemoPublicKey;
};

type StoredDemoKey = {
  privateKey: JsonWebKey;
  publicKey: DemoPublicKey;
  keyId: string;
};

const KEY_STORAGE_KEY = "medisync.demo-keys.v1";
const PAYLOAD_KEYS: Array<keyof PrescriptionPayload> = [
  "id",
  "patientId",
  "medicine",
  "dosage",
  "frequency",
  "duration",
  "prescriberId",
  "hospital",
  "issuedAtISO",
];

export function canonicalizePrescription(payload: PrescriptionPayload): string {
  return JSON.stringify(PAYLOAD_KEYS.map((key) => [key, payload[key]]));
}

function assertClientCrypto(): Crypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto is only available in a secure browser context.");
  }
  return window.crypto;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function canonicalPayloadBytes(payload: PrescriptionPayload): Uint8Array {
  return new TextEncoder().encode(canonicalizePrescription(payload));
}

async function payloadDigest(payload: PrescriptionPayload): Promise<Uint8Array> {
  const crypto = assertClientCrypto();
  return new Uint8Array(await crypto.subtle.digest("SHA-256", canonicalPayloadBytes(payload)));
}

function readKeys(): Record<string, StoredDemoKey> {
  const raw = window.localStorage.getItem(KEY_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, StoredDemoKey>) : {};
}

async function getOrCreateDemoKey(prescriberId: string): Promise<StoredDemoKey> {
  assertClientCrypto();
  const keys = readKeys();
  const existing = keys[prescriberId];
  if (existing) return existing;

  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const privateKey = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKey = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const publicKeyBytes = new TextEncoder().encode(JSON.stringify(publicKey));
  const keyId = bytesToHex(
    new Uint8Array(await window.crypto.subtle.digest("SHA-256", publicKeyBytes)),
  );
  const stored = { privateKey, publicKey, keyId };
  keys[prescriberId] = stored;
  window.localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(keys));
  return stored;
}

export async function signPrescriptionPayload(
  payload: PrescriptionPayload,
): Promise<SignedPayload> {
  const stored = await getOrCreateDemoKey(payload.prescriberId);
  const privateKey = await window.crypto.subtle.importKey(
    "jwk",
    stored.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const digest = await payloadDigest(payload);
  const signature = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    canonicalPayloadBytes(payload),
  );
  return {
    payloadHash: bytesToHex(digest),
    signature: bytesToBase64(new Uint8Array(signature)),
    prescriberKeyId: stored.keyId,
    prescriberPublicKey: stored.publicKey,
  };
}

export async function verifyPrescriptionPayload(
  payload: PrescriptionPayload,
  signed: SignedPayload,
): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !window.crypto?.subtle ||
    !signed.payloadHash ||
    !signed.signature ||
    !signed.prescriberKeyId ||
    !signed.prescriberPublicKey
  ) {
    return false;
  }

  try {
    const digest = await payloadDigest(payload);
    if (bytesToHex(digest) !== signed.payloadHash) return false;

    const publicKeyBytes = new TextEncoder().encode(JSON.stringify(signed.prescriberPublicKey));
    const actualKeyId = bytesToHex(
      new Uint8Array(await window.crypto.subtle.digest("SHA-256", publicKeyBytes)),
    );
    if (actualKeyId !== signed.prescriberKeyId) return false;

    const publicKey = await window.crypto.subtle.importKey(
      "jwk",
      signed.prescriberPublicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await window.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      base64ToBytes(signed.signature),
      canonicalPayloadBytes(payload),
    );
  } catch {
    return false;
  }
}
