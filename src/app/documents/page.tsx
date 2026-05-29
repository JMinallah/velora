"use client";

import { useEffect, useState } from "react";
import { DocumentList } from "@/components/documents/DocumentList";
import { FileUpload } from "@/components/documents/FileUpload";
import type { DocumentRecord, MissionRecord } from "@/lib/mongodb/models";

export default function DocumentsPage() {
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [activeMissionId, setActiveMissionId] = useState("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMissions() {
      try {
        const response = await fetch("/api/missions");
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load missions");
        }

        if (cancelled) return;

        setMissions(data.data ?? []);
        setActiveMissionId((current) => current || data.data?.[0]?.id || "");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load missions");
        }
      }
    }

    loadMissions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeMissionId) return;

    let cancelled = false;

    async function loadDocuments() {
      try {
        const response = await fetch(`/api/missions/${activeMissionId}/documents`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load documents");
        }

        if (!cancelled) {
          setDocuments(data.data ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load documents");
        }
      }
    }

    loadDocuments();

    return () => {
      cancelled = true;
    };
  }, [activeMissionId]);

  const activeMission = missions.find((mission) => mission.id === activeMissionId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Document Intelligence
        </h1>
        <p className="text-muted-foreground">
          Upload your documents here. Velora will automatically extract key
          information.
        </p>
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Mission</label>
        <select
          value={activeMissionId}
          onChange={(event) => setActiveMissionId(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {missions.map((mission) => (
            <option key={mission.id} value={mission.id}>
              {mission.title}
            </option>
          ))}
        </select>
        {activeMission ? (
          <p className="text-xs text-muted-foreground">{activeMission.subtitle}</p>
        ) : null}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <FileUpload
            missionId={activeMissionId}
            onUploaded={(document) => setDocuments((current) => [document, ...current])}
          />
        </div>
        <div className="flex flex-col gap-8">
          <DocumentList documents={documents} />
        </div>
      </div>
    </div>
  );
}
