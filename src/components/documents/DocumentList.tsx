import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ImageIcon, File as FileIcon } from "lucide-react";

type Document = {
  name: string;
  type: "pdf" | "image" | "other";
  size: string;
};

const mockDocuments: Document[] = [
  { name: "acceptance_letter.pdf", type: "pdf", size: "1.2 MB" },
  { name: "passport_scan.jpg", type: "image", size: "850 KB" },
  { name: "financial_statement.pdf", type: "pdf", size: "2.5 MB" },
  { name: "visa_requirements.docx", type: "other", size: "300 KB" },
];

const iconMap = {
  pdf: <FileText className="h-6 w-6 text-red-500" />,
  image: <ImageIcon className="h-6 w-6 text-blue-500" />,
  other: <FileIcon className="h-6 w-6 text-gray-500" />,
};

export function DocumentList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Uploaded Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {mockDocuments.map((doc, index) => (
            <div key={index} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50">
              <div className="flex-shrink-0">{iconMap[doc.type]}</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{doc.name}</p>
                <p className="text-xs text-muted-foreground">{doc.size}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
