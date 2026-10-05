import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { searchLocalPatients, useOfflineDb } from "@/lib/offline-db";
import { BrandLogo } from "@/components/shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediSync — Unified Cross-Hospital Medical Record Platform" },
      {
        name: "description",
        content:
          "MediSync is an offline-first local medical record platform with role portals for doctors, patients and pharmacists.",
      },
      { property: "og:title", content: "MediSync — Unified Cross-Hospital Record Platform" },
      {
        property: "og:description",
        content: "One patient. One record. Offline and ready when the network is not.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { db, update, log, selectPatient } = useOfflineDb();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Awaited<
    ReturnType<typeof searchLocalPatients>
  > | null>(null);
  const [bypassReason, setBypassReason] = useState("");

  const bypass = db.emergencyBypass;

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await searchLocalPatients(trimmed);
      setSearchResults(results);
      if (results.length) log(`Local search found ${results.length} matching patient record(s).`);
    } catch (error) {
      console.error(error);
      toast.error("Local patient search failed.");
    }
  };

  const handleBypass = () => {
    const reason = bypassReason.trim();

    if (bypass) {
      update((d) => ({ ...d, emergencyBypass: false }));
      log(`Emergency trauma bypass disengaged for ${db.patient.name} (${db.patient.id})`);
      setBypassReason("");
      return;
    }

    if (!reason) {
      toast.error("A reason is required before emergency trauma bypass can be activated.");
      return;
    }

    update((d) => ({ ...d, emergencyBypass: true }));
    log(
      `🚨 Emergency trauma bypass engaged — patient ${db.patient.name} (${db.patient.id}) — reason: ${reason}`,
    );
    setBypassReason("");
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-6 py-5">
          <BrandLogo />
          <nav className="hidden flex-1 items-center justify-center gap-8 md:flex">
            {[
              { label: "Clinical Departments", href: "#registry" },
              { label: "Vetted Partner Directory", href: "#portal-access" },
              { label: "Demo overview", href: "#portal-access" },
              { label: "Local Mesh Directory", href: "#registry" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="clinical-label text-canvas/65 transition-colors hover:text-spring"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {!bypass && (
              <input
                value={bypassReason}
                onChange={(e) => setBypassReason(e.target.value)}
                aria-label="Emergency bypass reason"
                placeholder="Bypass reason"
                className="clinical-data w-44 rounded-lg border border-spring/40 bg-navy-soft px-3 py-2 text-canvas placeholder:text-canvas/45 focus:border-spring focus:outline-none"
              />
            )}
            <button
              onClick={handleBypass}
              className={`clinical-label rounded-xl px-5 py-2.5 transition-all ${
                bypass
                  ? "bg-alert text-canvas"
                  : "border border-spring/50 text-spring hover:bg-spring hover:text-navy"
              }`}
            >
              Emergency trauma bypass{bypass ? " · active" : ""}
            </button>
          </div>
        </div>
      </header>

      <section className="bg-navy px-6 pb-20 pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="clinical-data text-spring/85">
            Demo · synthetic data · stored locally on this device
          </p>
          <h1 className="brand-title mt-5 text-3xl leading-[1.25] text-canvas md:text-5xl md:leading-[1.2]">
            Unified cross-hospital interoperability.
            <span className="mt-3 block text-canvas/70">One patient. One record. Anywhere.</span>
          </h1>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              aria-label="Patient search"
              placeholder="Patient ID, name, phone or ABHA ID — try PAT-99203"
              className="clinical-data w-full rounded-xl border border-nuit/70 bg-navy-soft px-5 py-3.5 text-canvas placeholder:text-canvas/40 focus:border-spring focus:outline-none"
            />
            <button
              onClick={() => void search()}
              className="clinical-label rounded-xl bg-pbgreen px-7 py-3.5 font-bold text-canvas hover:brightness-110"
            >
              Search
            </button>
          </div>
          {searchResults !== null && (
            <div className="mt-5 rounded-xl bg-white p-4 text-left text-navy">
              {searchResults.length === 0 ? (
                <p className="clinical-data">No local match</p>
              ) : (
                <ul className="space-y-3">
                  {searchResults.map((patient) => (
                    <li
                      key={patient.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-navy/10 pb-3 last:border-0 last:pb-0"
                    >
                      <p className="clinical-data">
                        <strong>{patient.name}</strong> · {patient.id} · {patient.phone} · ABHA{" "}
                        {patient.abha}
                      </p>
                      <button
                        onClick={() => {
                          void selectPatient(patient.id).catch((error: unknown) => {
                            console.error(error);
                            toast.error("Could not load this local patient record.");
                          });
                        }}
                        className="clinical-label rounded-md bg-pbgreen px-3 py-1.5 text-canvas"
                      >
                        Set active patient
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {bypass && (
            <div className="animate-fade-in mt-8 rounded-xl border border-alert/50 bg-alert/12 p-6 text-left">
              <p className="clinical-label text-spring">Trauma bypass — critical record snapshot</p>
              <p className="clinical-data mt-2 text-canvas/85">
                {db.patient.name} · {db.patient.id} · Blood {db.patient.bloodGroup} · Allergies:{" "}
                {db.patient.allergies.map((a) => `${a.name} (${a.severity})`).join(", ")} · BP{" "}
                {db.vitals.bloodPressure} · HR {db.vitals.heartRate}
              </p>
              <Link
                to="/patient"
                className="clinical-label mt-3 inline-block text-spring underline"
              >
                Open passport without PIN →
              </Link>
            </div>
          )}
        </div>
      </section>

      <section id="registry" className="mx-auto -mt-12 max-w-[1200px] px-6">
        <div className="card-elevated p-7 text-center">
          <p className="brand-title text-xl text-navy">Synthetic demo dataset</p>
          <p className="clinical-data mt-1 text-navy/60">
            Stored locally on this device. No live hospital network or pharmacy directory is
            connected.
          </p>
        </div>
      </section>

      <section id="portal-access" className="mx-auto max-w-[1200px] px-6 py-20">
        <h2 className="brand-title text-2xl text-navy">Role-based portal access</h2>
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <PortalCard
            tag="CLINICIAN"
            title="Doctor Workstation"
            body="Simulated consultation controls, local patient records, and demo prescriptions signed with locally stored demo keys."
            cta="Launch Doctor Workstation →"
            to="/doctor"
          />
          <PortalCard
            tag="PATIENT"
            title="Patient Passport"
            body="Visual lifetime medical passport timeline, accessibility controls, and local record access for the patient on this device."
            cta="Launch Patient Passport →"
            to="/patient"
          />
          <PortalCard
            tag="PHARMACY"
            title="Pharmacist Dispatch Queue"
            body="Local prescription queues with signature checks, single-dispense lockout, and a clear audit trail for each token."
            cta="Open Pharmacy Queue →"
            to="/pharmacist"
          />
        </div>
      </section>

      <footer className="bg-navy px-6 py-8">
        <p className="clinical-data mx-auto max-w-[1200px] text-canvas/60">
          MediSync demo · Stored locally on this device · Synthetic data only.
        </p>
      </footer>
    </div>
  );
}

function PortalCard({
  tag,
  title,
  body,
  cta,
  to,
}: {
  tag: string;
  title: string;
  body: string;
  cta: string;
  to: string;
}) {
  return (
    <div className="card-elevated flex flex-col p-8 transition-transform duration-200 hover:-translate-y-1">
      <span className="clinical-data w-fit rounded-full bg-spring/85 px-3 py-0.5 text-navy">
        {tag}
      </span>
      <h3 className="brand-title mt-4 text-xl text-navy">{title}</h3>
      <p className="clinical-data mt-4 flex-1 text-navy/65">{body}</p>
      <Link
        to={to}
        className="clinical-label mt-7 rounded-xl bg-navy px-4 py-3 text-center text-canvas transition-colors hover:bg-nuit"
      >
        {cta}
      </Link>
    </div>
  );
}
