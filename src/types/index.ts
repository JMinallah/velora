export type ExtractedData = {
  title: string;
  data: Record<string, string>;
};

export type Message = {
  id: string;
  type: "suggestion" | "alert" | "update" | "reasoning";
  text: string;
  timestamp: string;
  extractedData?: ExtractedData;
};

export type Task = {
  id: string;
  label: string;
  completed: boolean;
  dueDate: string;
};

export type TaskCategory = {
  [category: string]: Task[];
};
  