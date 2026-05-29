import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ImageIcon, File as FileIcon } from "lucide-react";
import type { DocumentRecord } from "@/lib/mongodb/models";

function getDocumentIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="h-6 w-6 text-blue-500" />;
  }

  if (mimeType.includes("pdf")) {
    return <FileText className="h-6 w-6 text-red-500" />;
  }

  return <FileIcon className="h-6 w-6 text-gray-500" />;
}

function getDocumentKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("pdf")) return "PDF";
  return "File";
}

export function DocumentList({ documents }: { documents: DocumentRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Uploaded Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents attached yet.</p>
          ) : (
            documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-4 rounded-lg bg-secondary/50 p-3">
              <div className="flex-shrink-0">{getDocumentIcon(doc.mimeType)}</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{doc.name}</p>
                <p className="text-xs text-muted-foreground">{getDocumentKind(doc.mimeType)}</p>
                {doc.summary ? <p className="mt-1 text-xs text-muted-foreground">{doc.summary}</p> : null}
              </div>
            </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
