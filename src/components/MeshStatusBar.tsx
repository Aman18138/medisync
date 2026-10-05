import { useEffect, useState } from "react";
import { useOfflineDb } from "@/lib/offline-db";
import { formatLastSync, subscribeToMeshStatus, type MeshStatus } from "@/lib/vault/sync";

const initialStatus: MeshStatus = { peerCount: 0, lastSyncAt: null };

export function MeshStatusBar() {
  const { db } = useOfflineDb();
  const [meshStatus, setMeshStatus] = useState(initialStatus);

  useEffect(() => subscribeToMeshStatus(setMeshStatus), []);

  const pendingCount = db.prescriptions.filter(
    (prescription) => prescription.status === "Dispensation Pending",
  ).length;

  return (
    <div className="w-full bg-navy text-canvas">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3 text-xs">
        <span className="clinical-data text-canvas/70">Stored locally on this device</span>
        <span className="clinical-data flex items-center gap-2 text-canvas/70">
          <span className="inline-block size-2 rounded-full bg-mantis" />
          Local tab mesh (Bluetooth simulated)
        </span>
        <span className="clinical-data flex items-center gap-2 text-canvas/70">
          <span className="inline-block size-2 rounded-full bg-spring" />
          {meshStatus.peerCount} other open tab{meshStatus.peerCount === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="clinical-data text-canvas/45">
            Last sync: {formatLastSync(meshStatus.lastSyncAt)}
          </span>
          <span className="clinical-data text-canvas/45">Pending: {pendingCount}</span>
        </div>
      </div>
    </div>
  );
}
