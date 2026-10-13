"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import type { DocumentRecord } from "@/domain/collections";

const ACCEPT = { "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] };
const MAX_BYTES = 10 * 1024 * 1024;

type Status = { name: string; state: "uploading" | "done" | "error"; message?: string };

/** Uploads one file: signed upload URL → PUT bytes straight to storage → server verifies and creates the document. */
async function uploadFile(missionId: string, file: File): Promise<DocumentRecord> {
  const errorOf = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => null);
    return new Error(typeof data?.error === "string" ? data.error : fallback);
  };
  const start = await fetch(`/api/missions/${missionId}/documents/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size }),
  });
  if (!start.ok) throw await errorOf(start, "Couldn't start the upload.");
  const { uploadId, url, headers } = (await start.json()).data;

  const put = await fetch(url, { method: "PUT", headers, body: file });
  if (!put.ok) throw await errorOf(put, "The upload failed.");

  const done = await fetch(`/api/missions/${missionId}/documents/uploads/${uploadId}/complete`, { method: "POST" });
  if (!done.ok) throw await errorOf(done, "The upload couldn't be verified.");
  return (await done.json()).data;
}

export function FileUpload({
  missionId,
  onUploaded,
}: {
  missionId: string;
  onUploaded?: (document: DocumentRecord) => void;
}) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const setStatus = (status: Status) =>
    setStatuses((cur) => [...cur.filter((s) => s.name !== status.name), status]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    disabled: !missionId,
    onDropRejected: (rejections) =>
      rejections.forEach((r) =>
        setStatus({
          name: r.file.name,
          state: "error",
          message: r.errors.some((e) => e.code === "file-too-large") ? "Larger than 10 MB." : "Only PDF, PNG and JPG files.",
        })
      ),
    onDropAccepted: async (files) => {
      for (const file of files) {
        setStatus({ name: file.name, state: "uploading" });
        try {
          const document = await uploadFile(missionId, file);
          setStatus({ name: file.name, state: "done" });
          onUploaded?.(document);
        } catch (err) {
          setStatus({ name: file.name, state: "error", message: err instanceof Error ? err.message : "Upload failed." });
        }
      }
    },
  });

  const style = `flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
    isDragActive ? "border-primary bg-primary/10" : "cursor-pointer border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60"
  }`;

  return (
    <div className="space-y-2">
      <div {...getRootProps({ className: style })}>
        <input {...getInputProps()} aria-label="Upload documents" />
        <UploadCloud className="h-10 w-10 text-muted-foreground" />
        <p className={isDragActive ? "font-semibold text-primary" : "text-muted-foreground"}>
          {isDragActive ? "Drop the files here…" : "Drag & drop files here, or click to choose"}
        </p>
        <p className="text-xs text-muted-foreground">PDF, PNG or JPG, up to 10 MB. Stored privately.</p>
      </div>
      {statuses.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Upload status">
          {statuses.map((s) => (
            <li key={s.name} className={s.state === "error" ? "text-destructive" : "text-muted-foreground"}>
              {s.name}: {s.state === "uploading" ? "uploading…" : s.state === "done" ? "uploaded ✓" : s.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
