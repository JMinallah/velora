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
import type { DocumentRecord, MessageRecord, MissionRecord, TaskRecord, EventRecord, ReminderRecord } from "@/lib/mongodb/models";
import { Message } from "@/types";
import { Bell, Menu, Plus, Send, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { loadLatestTransitionPlan } from "@/lib/coordination/session";

function resolveMissionId(value: string | string[] | undefined, availableIds: string[]) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return availableIds[0] ?? ""
  return availableIds.includes(candidate) ? candidate : availableIds[0] ?? candidate
}

type MissionViewModel = MissionRecord & {
  tasks: TaskRecord[];
  messages: MessageRecord[];
  documents: DocumentRecord[];
  events?: EventRecord[];
  reminders?: ReminderRecord[];
};

function formatTaskLabel(task: TaskRecord) {
  const bits = [task.category, task.priority ? task.priority : null].filter(Boolean)
  return bits.join(" · ")
}

export default function MissionPage() {
  const params = useParams();
  const [draft, setDraft] = useState("");
  const [missions, setMissions] = useState<Record<string, MissionViewModel>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paramsForResolve = params?.id;
  const availableIds = Object.keys(missions)
  const activeMissionId = resolveMissionId(paramsForResolve, availableIds)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [latestPlan, setLatestPlan] = useState(() => loadLatestTransitionPlan());
  const [selectedDocumentsByMission, setSelectedDocumentsByMission] = useState<Record<string, string[]>>(() => ({}));
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMission = missions[activeMissionId] ?? Object.values(missions)[0];
  const selectedDocuments = selectedDocumentsByMission[activeMissionId] ?? [];

  useEffect(() => {
    const container = messageListRef.current;
    if (!container || !activeMission) return;

    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
  }, [activeMissionId, activeMission, activeMission?.messages]);

  // Fetch missions list on mount
  useEffect(() => {
    let cancelled = false

    async function loadMissions() {
      try {
        setIsLoading(true)
        setError(null)

        const res = await fetch(`/api/missions`)
        const json = await res.json().catch(() => ({}))
        if (!json?.success) throw new Error(json?.error || 'failed')

        const map = Object.fromEntries(
          (json.data || []).map((m: MissionRecord) => [m.id, { ...m, messages: [], tasks: [], documents: [] }])
        ) as Record<string, MissionViewModel>

        if (!cancelled) setMissions(map)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load missions')
        }
        console.error('Failed to load missions', err)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadMissions()

    return () => { cancelled = true }
  }, [])

  // Load tasks and messages for active mission
  useEffect(() => {
    if (!activeMissionId) return

    let cancelled = false

    async function loadDetails(id: string) {
      try {
        const [tasksRes, messagesRes, documentsRes, eventsRes, remindersRes] = await Promise.all([
          fetch(`/api/missions/${id}/tasks`),
          fetch(`/api/missions/${id}/messages`),
          fetch(`/api/missions/${id}/documents`),
          fetch(`/api/missions/${id}/events`),
          fetch(`/api/reminders?missionId=${id}`),
        ])
    
        const tasksJson = await tasksRes.json()
        const messagesJson = await messagesRes.json()
        const documentsJson = await documentsRes.json()
        const eventsJson = await eventsRes.json()
        const remindersJson = await remindersRes.json()
    
        if (!tasksJson?.success && tasksRes.ok) throw new Error('Failed to fetch tasks')
        if (!messagesJson?.success && messagesRes.ok) throw new Error('Failed to fetch messages')
        if (!documentsJson?.success && documentsRes.ok) throw new Error('Failed to fetch documents')
    
        if (cancelled) return
    
        setMissions((current) => ({
          ...current,
          [id]: {
            ...(current[id] ?? {}),
            tasks: tasksJson?.data ?? [],
            messages: messagesJson?.data ?? [],
            documents: documentsJson?.data ?? [],
            events: eventsJson?.data ?? [],
            reminders: remindersJson?.data ?? [],
          },
        }))
      } catch (err) {
        console.error('Failed to load mission details', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load mission details')
        }
      }
    }

    loadDetails(activeMissionId)

    return () => { cancelled = true }
  }, [activeMissionId])

  // latestPlan is initialized lazily above to avoid synchronous setState in an effect

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
      createdAt: new Date().toISOString(),
    };

    setMissions((currentMissions) => {
      const currentMission = currentMissions[activeMissionId];

      return {
        ...currentMissions,
        [activeMissionId]: {
          ...currentMission,
          messages: [...currentMission.messages, userMessage],
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
      const userResponse = await fetch(`/api/missions/${missionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user",
          text: userText,
        }),
      })

      const userData = await userResponse.json().catch(() => ({}))
      if (!userResponse.ok || !userData?.success) {
        throw new Error(userData?.error || "Failed to save user message")
      }

      const assistantId = `msg-${Date.now()}-reply`;
      const assistantMessage: Message = {
        id: assistantId,
        type: "reasoning",
        text: "",
        createdAt: new Date().toISOString(),
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

      let finalAssistantText = "";
      await sendGeminiChat({
        message: trimmed || attachmentSummary,
        sessionId: missionId,
        history: missionSnapshot.messages.map((message) => ({
          sender: message.type === "user" ? "user" : "assistant",
          text: message.text,
        })),
        context,
      }, {
        onChunk: (chunk) => {
          finalAssistantText += chunk;
          setMissions((currentMissions) => {
            const currentMission = currentMissions[missionId];
            return {
              ...currentMissions,
              [missionId]: {
                ...currentMission,
                messages: currentMission.messages.map(m => 
                  m.id === assistantId ? { ...m, text: finalAssistantText } : m
                ),
              },
            };
          });
        }
      });

      const assistantResponse = await fetch(`/api/missions/${missionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "reasoning",
          text: finalAssistantText,
        }),
      })

      const assistantData = await assistantResponse.json().catch(() => ({}))
      if (!assistantResponse.ok || !assistantData?.success) {
        throw new Error(assistantData?.error || "Failed to save assistant message")
      }
    } catch (error) {
      console.error("Mission chat error:", error);

      const fallbackMessage: Message = {
        id: `msg-${Date.now()}-error`,
        type: "alert",
        text: "I couldn’t get a response right now. Please try again.",
        createdAt: new Date().toISOString(),
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
    () => Object.values(missions).filter(Boolean),
    [missions]
  );

  const activeMissionDocuments = activeMission.documents;
  const activeMissionTasks = activeMission.tasks;
  const [newTaskLabel, setNewTaskLabel] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const MissionPanel = (
    <div className="flex flex-col gap-1">
      {missionSwitcher.map((mission, idx) => {
        const isActive = mission.id === activeMissionId;
        const key = mission.id ?? `mission-${idx}`;

        return (
          <Link
            key={key}
            href={`/mission/${mission.id ?? ""}`}
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

      <Link
        href={`/mission/${activeMissionId}/events`}
        className="mt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        View mission events
      </Link>
    </div>
  );

  if (!isLoading && Object.keys(missions).length === 0) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] flex-col items-center justify-center text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-semibold">No missions found</h2>
        <p className="mt-2 text-muted-foreground max-w-sm">
          You haven&apos;t created any missions yet. Start by creating your first transition plan.
        </p>
        <Link href="/onboarding">
          <Button className="mt-6">Create a Mission</Button>
        </Link>
      </div>
    );
  }

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

          {isLoading ? (
            <div className="rounded-2xl border border-border/20 bg-muted/20 p-4 text-sm text-muted-foreground">
              Loading mission data...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {!isLoading && !activeMission ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-muted/5 p-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Plus className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold">Mission not found</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs">
                We couldn&apos;t find the mission you&apos;re looking for. It might have been deleted or the link is incorrect.
              </p>
              <Link href="/onboarding">
                <Button className="mt-6" variant="outline">Create a New Mission</Button>
              </Link>
            </div>
          ) : activeMission && (
            <>
              {latestPlan && (
                <div className="rounded-2xl border border-border/20 bg-muted/20 p-4 text-sm text-muted-foreground">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
                    Latest generated plan
                  </p>
                  <p className="whitespace-pre-wrap">{latestPlan}</p>
                </div>
              )}

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
                              {activeMissionDocuments.map((document) => {
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
                                      {document.summary ?? document.extractedText ?? "No document summary yet"}
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
            </>
          )}
        </section>

        {activeMission && (
          <section className="space-y-4 pt-2 xl:mt-auto">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Mission tasks
              </h2>
              <p className="text-sm text-muted-foreground">
                Recorded work items linked to the active mission.
              </p>
            </div>

            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newTaskLabel.trim()) return
                  setIsCreatingTask(true)
                  try {
                    const res = await fetch(`/api/missions/${activeMissionId}/tasks`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ label: newTaskLabel.trim(), category: "General", priority: newTaskPriority }),
                    })

                    const data = await res.json().catch(() => ({}))
                    if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to create task")

                    setMissions((cur) => ({
                      ...cur,
                      [activeMissionId]: {
                        ...(cur[activeMissionId] ?? {}),
                        tasks: [data.data, ...(cur[activeMissionId]?.tasks ?? [])],
                      },
                    }))

                    setNewTaskLabel("")
                  } catch (err) {
                    console.error("Create task failed", err)
                  } finally {
                    setIsCreatingTask(false)
                  }
                }}
              >
                <div className="flex gap-2">
                  <input value={newTaskLabel} onChange={(e) => setNewTaskLabel(e.target.value)} placeholder="New task" className="flex-1 rounded-md border px-2 py-1" />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as "low" | "medium" | "high")}
                    className="rounded-md border px-2 py-1"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <button type="submit" disabled={isCreatingTask} className="rounded-md bg-primary px-3 py-1 text-white">
                    {isCreatingTask ? "Adding..." : "Add"}
                  </button>
                </div>
              </form>

              {activeMissionTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks yet.</p>
              ) : null}
              {activeMissionTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(task.completed)}
                    onChange={async (e) => {
                      const checked = e.target.checked
                      try {
                        const res = await fetch(`/api/missions/${activeMissionId}/tasks/${task.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ completed: checked }),
                        })

                        const data = await res.json().catch(() => ({}))
                        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to update task")

                        setMissions((cur) => ({
                          ...cur,
                          [activeMissionId]: {
                            ...(cur[activeMissionId] ?? {}),
                            tasks: (cur[activeMissionId]?.tasks ?? []).map((t) => (t.id === task.id ? data.data : t)),
                          },
                        }))
                      } catch (err) {
                        console.error("Failed to toggle task", err)
                      }
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.label}</p>
                    <p className="text-sm text-muted-foreground">{formatTaskLabel(task)}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">{task.createdAt}</time>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="hidden h-fit xl:sticky xl:top-24 xl:flex xl:flex-col rounded-2xl bg-muted/20 p-4">
        {activeMission && activeMission.reminders && activeMission.reminders.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Reminders
            </h2>
            <div className="space-y-2">
              {activeMission.reminders.filter(r => !r.read).map((reminder) => (
                <div key={reminder.id} className="group relative rounded-lg bg-background p-3 shadow-sm border border-border/50">
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/reminders`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "markRead", ids: [reminder.id] }),
                        })
                        if (res.ok) {
                          setMissions((cur) => ({
                            ...cur,
                            [activeMissionId]: {
                              ...(cur[activeMissionId] ?? {}),
                              reminders: (cur[activeMissionId]?.reminders ?? []).map((r) =>
                                r.id === reminder.id ? { ...r, read: true } : r
                              ),
                            },
                          }))
                        }
                      } catch (err) {
                        console.error("Failed to mark reminder as read", err)
                      }
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    title="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <p className="text-sm font-medium pr-4">{reminder.title}</p>
                  {reminder.details && <p className="text-xs text-muted-foreground mt-1">{reminder.details}</p>}
                  <p className="text-[10px] text-primary mt-2 font-medium">
                    Due: {new Date(reminder.dueAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeMission && (
          <>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent activity
            </h2>
            <div className="mb-3 max-h-48 overflow-y-auto pr-1 text-sm text-muted-foreground">
              {(activeMission.events ?? []).slice().reverse().slice(0, 8).map((ev) => (
                <div key={ev.id} className="mb-2">
                  <p className="truncate font-medium">{ev.type.replace(/-/g, ' ')}</p>
                  <p className="truncate text-xs">{JSON.stringify(ev.payload)}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="mb-3 mt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Missions
        </h2>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          {MissionPanel}
        </div>
      </aside>
    </div>
  );
}
