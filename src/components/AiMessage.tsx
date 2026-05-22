import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { Message } from "@/types";

const messageConfig = {
  suggestion: {
    icon: Lightbulb,
    bgColor: "bg-blue-50",
    textColor: "text-blue-800",
    iconColor: "text-blue-500",
    darkBgColor: "dark:bg-blue-900/30",
    darkTextColor: "dark:text-blue-300",
    darkIconColor: "dark:text-blue-400",
  },
  alert: {
    icon: AlertTriangle,
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-800",
    iconColor: "text-yellow-500",
    darkBgColor: "dark:bg-yellow-900/30",
    darkTextColor: "dark:text-yellow-300",
    darkIconColor: "dark:text-yellow-400",
  },
  update: {
    icon: CheckCircle2,
    bgColor: "bg-green-50",
    textColor: "text-green-800",
    iconColor: "text-green-500",
    darkBgColor: "dark:bg-green-900/30",
    darkTextColor: "dark:text-green-300",
    darkIconColor: "dark:text-green-400",
  },
  reasoning: {
    icon: Info,
    bgColor: "bg-gray-50",
    textColor: "text-gray-700",
    iconColor: "text-gray-500",
    darkBgColor: "dark:bg-gray-800/40",
    darkTextColor: "dark:text-gray-300",
    darkIconColor: "dark:text-gray-400",
  },
};

export function AiMessage({ message }: { message: Message }) {
  const config = messageConfig[message.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg p-4",
        config.bgColor,
        config.textColor,
        config.darkBgColor,
        config.darkTextColor
      )}
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.iconColor, config.darkIconColor)} />
      <div className="flex-1">
        <p className="text-sm">{message.text}</p>
        <p className="text-xs text-muted-foreground mt-2">{message.timestamp}</p>
      </div>
    </div>
  );
}
