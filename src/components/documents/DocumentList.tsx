"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ImageIcon, File as FileIcon, Eye, Trash2 } from "lucide-react";
import type { DocumentRecord } from "@/domain/collections";
import { DocumentExtraction } from "./DocumentExtraction";

function getDocumentIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-6 w-6 text-blue-500" />;
  if (mimeType.includes("pdf")) return <FileText className="h-6 w-6 text-red-500" />;
  return <FileIcon className="h-6 w-6 text-gray-500" />;
}

function getDocumentKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("pdf")) return "PDF";
  return "File";
}

/**
 * The mission's documents. "View" asks the server for a fresh link that
 * expires within minutes (files are never public); "Delete" removes the
 * record and the stored file.
 */
export function DocumentList({
  missionId,
  documents,
  onDeleted,
  onUpdated,
}: {
  missionId: string;
  documents: DocumentRecord[];
  onDeleted?: (id: string) => void;
  onUpdated?: (doc: DocumentRecord) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const view = async (doc: DocumentRecord) => {
    setError(null);
    const res = await fetch(`/api/missions/${missionId}/documents/${doc.id}/view`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) window.open(data.data.url, "_blank", "noopener,noreferrer");
    else setError(typeof data?.error === "string" ? data.error : "Couldn't open that document.");
  };

  const remove = async (doc: DocumentRecord) => {
    setError(null);
    const res = await fetch(`/api/missions/${missionId}/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) onDeleted?.(doc.id);
    else setError("Couldn't delete that document.");
    setConfirming(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uploaded Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <ul className="grid gap-4" aria-label="Documents">
          {documents.length === 0 ? (
            <li className="text-sm text-muted-foreground">No documents attached yet.</li>
          ) : (
            documents.map((doc) => (
              <li key={doc.id} className="flex items-start gap-4 rounded-lg bg-secondary/50 p-3">
                <div className="flex-shrink-0">{getDocumentIcon(doc.mimeType)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{getDocumentKind(doc.mimeType)}</p>
                  {doc.summary ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.summary}</p> : null}
                  <DocumentExtraction missionId={missionId} doc={doc} onUpdated={(d) => onUpdated?.(d)} />
                </div>
                {confirming === doc.id ? (
                  <div className="flex shrink-0 items-center gap-1 text-sm">
                    <span>Delete?</span>
                    <Button size="sm" variant="destructive" onClick={() => remove(doc)}>Delete</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`View "${doc.name}"`} onClick={() => view(doc)}>
                      <Eye />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete "${doc.name}"`} onClick={() => setConfirming(doc.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
