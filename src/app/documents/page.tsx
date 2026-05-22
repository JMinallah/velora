import { DocumentList } from "@/components/documents/DocumentList";
import { FileUpload } from "@/components/documents/FileUpload";

export default function DocumentsPage() {
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
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <FileUpload />
        </div>
        <div className="flex flex-col gap-8">
          <DocumentList />
        </div>
      </div>
    </div>
  );
}
