"use client";

import { AiMessage } from "@/components/AiMessage";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { buildMissionChatContext, sendGeminiChat } from "@/lib/gemini-chat";
import { missionOrder, missionSeeds, type MissionId } from "@/lib/missions";
import { Message } from "@/types";
import { Menu, Plus, Send, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

function resolveMissionId(value: string | string[] | undefined): MissionId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return missionOrder.includes(candidate as MissionId)
    ? (candidate as MissionId)
    : "1";
}

export default function MissionPage() {
  const params = useParams();
  const activeMissionId = resolveMissionId(params.id);
  const [draft, setDraft] = useState("");
  const [missions, setMissions] = useState(missionSeeds);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedDocumentsByMission, setSelectedDocumentsByMission] = useState(
    () =>
      Object.fromEntries(
        missionOrder.map((id) => [id, [] as string[]])
      ) as Record<MissionId, string[]>
  );
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMission = missions[activeMissionId] ?? missions["1"];
  const selectedDocuments = selectedDocumentsByMission[activeMissionId] ?? [];

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
  }, [activeMissionId, activeMission.messages]);

  const addSelectedDocument = (documentName: string) => {
    setSelectedDocumentsByMission((currentDocumentsByMission) => {
      const currentDocuments = currentDocumentsByMission[activeMissionId] ?? [];

      if (currentDocuments.includes(documentName)) {
        return currentDocumentsByMission;
      }

      return {
        ...currentDocumentsByMission,
        [activeMissionId]: [...currentDocuments, documentName],
      };
    });

    setAttachmentMenuOpen(false);
  };

  const handleBrowseDevice = () => {
    setAttachmentMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleDeviceSelection = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files?.length) return;

    const fileNames = Array.from(files).map((file) => file.name);
    setSelectedDocumentsByMission((currentDocumentsByMission) => {
      const currentDocuments = currentDocumentsByMission[activeMissionId] ?? [];
      const uniqueNames = fileNames.filter(
        (fileName) => !currentDocuments.includes(fileName)
      );

      return {
        ...currentDocumentsByMission,
        [activeMissionId]: [...currentDocuments, ...uniqueNames],
      };
    });

    event.target.value = "";
  };

  const removeSelectedDocument = (documentName: string) => {
    setSelectedDocumentsByMission((currentDocumentsByMission) => ({
      ...currentDocumentsByMission,
      [activeMissionId]: (currentDocumentsByMission[activeMissionId] ?? []).filter(
        (currentDocument) => currentDocument !== documentName
      ),
    }));
  };

  const handleSendMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed && selectedDocuments.length === 0) return;

    const attachmentSummary = selectedDocuments.length
      ? `Attached documents: ${selectedDocuments.join(", ")}.`
      : "";
    const userText =
      trimmed && attachmentSummary
        ? `${trimmed}\n\n${attachmentSummary}`
        : trimmed || attachmentSummary;

    const missionSnapshot = activeMission;
    const missionId = activeMissionId;
    const context = buildMissionChatContext({
      missionTitle: missionSnapshot.title,
      missionSubtitle: missionSnapshot.subtitle,
      documents: selectedDocuments,
    });

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      type: "user",
      text: userText,
      timestamp: new Date().toLocaleString(),
    };

    const assistantMessage: Message = {
      id: `msg-${Date.now()}-reply`,
      type: "reasoning",
      text:
        selectedDocuments.length > 0
          ? `I’ve attached ${selectedDocuments.length} document${selectedDocuments.length === 1 ? "" : "s"} to this mission context and I’ll include them in follow-up reasoning.`
          : "I’ve attached that to the active mission context and I’ll keep the timeline focused on this thread.",
      timestamp: new Date().toLocaleString(),
    };

    setMissions((currentMissions) => {
      const currentMission = currentMissions[activeMissionId];

      return {
        ...currentMissions,
        [activeMissionId]: {
          ...currentMission,
          messages: [...currentMission.messages, userMessage, assistantMessage],
        },
      };
    });

    setDraft("");
    setSelectedDocumentsByMission((currentDocumentsByMission) => ({
      ...currentDocumentsByMission,
      [activeMissionId]: [],
    }));

    setIsSending(true);

    try {
      const assistantText = await sendGeminiChat({
        message: trimmed || attachmentSummary,
        history: missionSnapshot.messages.map((message) => ({
          sender: message.type === "user" ? "user" : "assistant",
          text: message.text,
        })),
        context,
      });

      const assistantMessage: Message = {
        id: `msg-${Date.now()}-reply`,
        type: "reasoning",
        text: assistantText,
        timestamp: new Date().toLocaleString(),
      };

      setMissions((currentMissions) => {
        const currentMission = currentMissions[missionId];

        return {
          ...currentMissions,
          [missionId]: {
            ...currentMission,
            messages: [...currentMission.messages, assistantMessage],
          },
        };
      });
    } catch (error) {
      console.error("Mission chat error:", error);

      const fallbackMessage: Message = {
        id: `msg-${Date.now()}-error`,
        type: "alert",
        text: "I couldn’t get a response right now. Please try again.",
        timestamp: new Date().toLocaleString(),
      };

      setMissions((currentMissions) => {
        const currentMission = currentMissions[missionId];

        return {
          ...currentMissions,
          [missionId]: {
            ...currentMission,
            messages: [...currentMission.messages, fallbackMessage],
          },
        };
      });
    } finally {
      setIsSending(false);
    }
  };

  const missionSwitcher = useMemo(
    () => missionOrder.map((id) => missions[id]),
    [missions]
  );

  const MissionPanel = (
    <div className="flex flex-col gap-1">
      {missionSwitcher.map((mission) => {
        const isActive = mission.id === activeMissionId;

        return (
          <Link
            key={mission.id}
            href={`/mission/${mission.id}`}
            className={`rounded-md px-0 py-1 text-left transition-colors hover:text-foreground ${
              isActive ? "font-medium text-foreground" : "text-muted-foreground"
            }`}
          >
            <p className="font-medium">{mission.title}</p>
          </Link>
        );
      })}

      <Link
        href="/onboarding"
        className="mt-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        + New mission
      </Link>
    </div>
  );

  return (
    <div className="grid gap-8 xl:min-h-[calc(100dvh-3.5rem)] xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-h-0 flex-col gap-8 xl:min-h-[calc(100dvh-3.5rem)]">
        <section className="flex min-h-0 flex-col gap-4 xl:flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">
                {activeMission.title}
              </h1>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="fixed top-16 right-4 z-50 gap-2 shadow-sm xl:hidden"
                >
                  <Menu className="h-4 w-4" />
                  Missions
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                hideOverlay
                className="right-3! top-26! bottom-3! max-h-[70vh]! w-[min(16rem,calc(100vw-1.5rem))]! overflow-hidden rounded-2xl p-4 bg-background backdrop-blur-none"
              >
                <SheetHeader>
                  <SheetTitle>All missions</SheetTitle>
                  <SheetDescription className="sr-only">
                    Switch between active missions or create a new one.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 max-h-[calc(100%-3rem)] overflow-y-auto pr-1">
                  {MissionPanel}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex min-h-0 max-h-[calc(100dvh-16rem)] flex-col gap-3 overflow-hidden rounded-2xl bg-background px-3 pt-3 pb-2 md:max-h-[calc(100dvh-17rem)] md:px-4 md:pt-4 md:pb-2 xl:max-h-none xl:flex-1">
            <div
              ref={messageListRef}
              className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto pr-1"
            >
              <AnimatePresence initial={false}>
                {activeMission.messages.map((message) => (
                  <motion.div
                    key={message.id}
                    layout
                    initial={{ opacity: 0, y: -10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <AiMessage message={message} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="shrink-0 border-t border-border/60 pt-2 md:pt-3">
              {selectedDocuments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedDocuments.map((documentName) => (
                    <div
                      key={documentName}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-2 py-1 text-xs"
                    >
                      <span className="max-w-40 truncate">{documentName}</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedDocument(documentName)}
                        aria-label={`Remove ${documentName}`}
                        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about deadlines, dependencies, documents, or what should happen next..."
                className="min-h-12 resize-none border-0 bg-transparent px-0 py-0 text-base leading-5 shadow-none focus-visible:ring-0 md:text-base"
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleDeviceSelection}
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <Popover open={attachmentMenuOpen} onOpenChange={setAttachmentMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label="Add documents"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-3">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium">Add documents</p>
                        <p className="text-xs text-muted-foreground">
                          Attach from this mission or your device.
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start"
                        onClick={handleBrowseDevice}
                      >
                        From this device
                      </Button>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          From uploaded documents
                        </p>
                        <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                          {activeMission.documents.map((document) => {
                            const isSelected = selectedDocuments.includes(document.name);

                            return (
                              <button
                                key={document.name}
                                type="button"
                                onClick={() => addSelectedDocument(document.name)}
                                className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                                  isSelected
                                    ? "bg-muted text-foreground"
                                    : "hover:bg-muted/70"
                                }`}
                              >
                                <p className="truncate font-medium">{document.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {document.note}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button onClick={handleSendMessage} className="gap-2" disabled={isSending}>
                  <Send className="h-4 w-4" />
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 pt-2 xl:mt-auto">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Action history
            </h2>
            <p className="text-sm text-muted-foreground">
              Recorded AI actions linked to the active mission.
            </p>
          </div>

          <div className="space-y-4">
            {activeMission.actions.map((action) => (
              <div key={action.id} className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary/70" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{action.title}</p>
                  <p className="text-sm text-muted-foreground">{action.details}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {action.timestamp}
                </time>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="hidden h-fit xl:sticky xl:top-24 xl:flex xl:flex-col rounded-2xl bg-muted/20 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Missions
        </h2>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          {MissionPanel}
        </div>
      </aside>
    </div>
  );
}
