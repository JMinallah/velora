type ExtractedData = {
    title: string;
    data: Record<string, string>;
  };
  
  export function ExtractedInfo({ extractedData }: { extractedData: ExtractedData }) {
    return (
      <div className="mt-3 rounded-lg border bg-background/50 p-3">
        <p className="mb-2 text-sm font-semibold">{extractedData.title}</p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {Object.entries(extractedData.data).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-medium text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  