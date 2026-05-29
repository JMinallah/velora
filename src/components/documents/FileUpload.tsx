"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import type { DocumentRecord } from "@/lib/mongodb/models";

export function FileUpload({
  missionId,
  onUploaded,
}: {
  missionId: string;
  onUploaded?: (document: DocumentRecord) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function inferStorageUrl(file: File) {
    return `local://${encodeURIComponent(file.name)}`;
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      setError(null);
      setFiles(acceptedFiles);

      if (!missionId || acceptedFiles.length === 0) return;

      setIsUploading(true);
      try {
        for (const file of acceptedFiles) {
          const response = await fetch(`/api/missions/${missionId}/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              storageUrl: inferStorageUrl(file),
              summary: "Uploaded from Velora UI",
            }),
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok || !data?.success) {
            throw new Error(data?.error || "Failed to upload document")
          }

          onUploaded?.(data.data);
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
  });

  const baseStyle = "flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors";
  const inactiveStyle = "border-border hover:border-primary/50 bg-secondary/30 hover:bg-secondary/60";
  const activeStyle = "border-primary bg-primary/10";

  const style = `${baseStyle} ${isDragActive ? activeStyle : inactiveStyle}`;

  return (
    <div {...getRootProps({ className: style })}>
      <input {...getInputProps()} />
      <div className="flex flex-col items-center text-center gap-2">
        <UploadCloud className="h-10 w-10 text-muted-foreground" />
        {isDragActive ? (
          <p className="font-semibold text-primary">Drop the files here ...</p>
        ) : (
          <p className="text-muted-foreground">
            Drag & drop files here, or click to select files
          </p>
        )}
        <p className="text-xs text-muted-foreground">PDF, PNG, JPG, or DOCX</p>
        {files.length > 0 ? (
          <p className="text-xs text-foreground">{files.length} file(s) selected</p>
        ) : null}
        {isUploading ? <p className="text-xs text-muted-foreground">Uploading...</p> : null}
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </div>
    </div>
  );
}
