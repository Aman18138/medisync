export type VaultChange = "prescription-issued" | "prescription-dispensed" | "patient-updated";

export type MeshStatus = {
  peerCount: number;
  lastSyncAt: number | null;
};

type SyncMessage =
  | { type: "heartbeat"; peerId: string; at: number }
  | { type: "change"; peerId: string; at: number; change: VaultChange };

type VaultChangeListener = (change: VaultChange) => void;
type MeshStatusListener = (status: MeshStatus) => void;

const CHANNEL_NAME = "medisync-local-tab-mesh";
const HEARTBEAT_INTERVAL_MS = 3000;
const PEER_TIMEOUT_MS = 9500;
const changeListeners = new Set<VaultChangeListener>();
const statusListeners = new Set<MeshStatusListener>();
const peers = new Map<string, number>();

let channel: BroadcastChannel | null = null;
let heartbeatTimer: number | null = null;
let peerId = "";
let lastSyncAt: number | null = null;

function getStatus(): MeshStatus {
  const cutoff = Date.now() - PEER_TIMEOUT_MS;
  for (const [id, lastSeen] of peers) {
    if (lastSeen < cutoff) peers.delete(id);
  }
  return { peerCount: peers.size, lastSyncAt };
}

function notifyStatus(): void {
  const status = getStatus();
  for (const listener of statusListeners) listener(status);
}

function announceHeartbeat(): void {
  if (!channel) return;
  channel.postMessage({
    type: "heartbeat",
    peerId,
    at: Date.now(),
  } satisfies SyncMessage);
  notifyStatus();
}

function handleMessage(event: MessageEvent<SyncMessage>): void {
  const message = event.data;
  if (!message || message.peerId === peerId || typeof message.peerId !== "string") return;

  if (message.type === "heartbeat") {
    peers.set(message.peerId, Date.now());
    notifyStatus();
    return;
  }

  if (message.type === "change") {
    peers.set(message.peerId, Date.now());
    lastSyncAt = message.at;
    for (const listener of changeListeners) listener(message.change);
    notifyStatus();
  }
}

function start(): void {
  if (typeof window === "undefined" || channel || !("BroadcastChannel" in window)) return;
  peerId = window.crypto.randomUUID();
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", handleMessage);
  announceHeartbeat();
  heartbeatTimer = window.setInterval(announceHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function stop(): void {
  if (changeListeners.size || statusListeners.size || !channel) return;
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  channel.removeEventListener("message", handleMessage);
  channel.close();
  channel = null;
  peers.clear();
  peerId = "";
}

export function subscribeToVaultChanges(listener: VaultChangeListener): () => void {
  start();
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
    stop();
  };
}

export function subscribeToMeshStatus(listener: MeshStatusListener): () => void {
  start();
  statusListeners.add(listener);
  listener(getStatus());
  return () => {
    statusListeners.delete(listener);
    stop();
  };
}

export function publishVaultChange(change: VaultChange): void {
  if (typeof window === "undefined") return;
  start();
  if (!channel) return;

  const at = Date.now();
  channel.postMessage({ type: "change", peerId, at, change } satisfies SyncMessage);
}

export function formatLastSync(at: number | null): string {
  return at === null ? "No data sync yet" : new Date(at).toLocaleTimeString();
}
