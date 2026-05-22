export type Message = {
    id: string;
    type: "suggestion" | "alert" | "update" | "reasoning";
    text: string;
    timestamp: string;
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
  