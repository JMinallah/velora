"use client";

import { UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

export function FileUpload() {
  const [files, setFiles] = useState<File[]>([]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      setFiles(acceptedFiles);
      // Here you would typically handle the file upload to your server
      console.log(acceptedFiles);
    },
  });

  const baseStyle = "flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors";
  const inactiveStyle = "border-border hover:border-primary/50 bg-secondary/30 hover:bg-secondary/60";
  const activeStyle = "border-primary bg-primary/10";

  const style = useMemo(
    () => `${baseStyle} ${isDragActive ? activeStyle : inactiveStyle}`,
    [isDragActive, baseStyle, activeStyle, inactiveStyle]
  );

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
      </div>
    </div>
  );
}
