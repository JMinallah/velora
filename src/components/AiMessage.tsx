import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { Message } from "@/types";
import { ExtractedInfo } from "./documents/ExtractedInfo";

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
  if (message.type === "user") {
    return (
      <div className="flex min-w-0 justify-end">
        <div className="max-w-[82%] min-w-0 rounded-2xl bg-primary px-3 py-2.5 text-primary-foreground shadow-sm">
          <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {message.text}
          </p>
          <p className="mt-1.5 text-[11px] text-primary-foreground/80">
            {message.timestamp}
          </p>
        </div>
      </div>
    );
  }

  const config = messageConfig[message.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-xl p-3",
        config.bgColor,
        config.textColor,
        config.darkBgColor,
        config.darkTextColor
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconColor, config.darkIconColor)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-6 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {message.text}
        </p>
        {message.extractedData && <ExtractedInfo extractedData={message.extractedData} />}
        <p className="mt-1.5 text-[11px] text-muted-foreground">{message.timestamp}</p>
      </div>
    </div>
  );
}
