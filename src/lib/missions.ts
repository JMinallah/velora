import { Message, MissionAction, TaskCategory } from "@/types";

export type MissionId = "1" | "2" | "3";

export type MissionDocumentReference = {
  name: string;
  note: string;
  href: string;
};

export type MissionSeed = {
  id: MissionId;
  title: string;
  subtitle: string;
  phase: string;
  status: "On track" | "Watch" | "At risk";
  overview: string;
  nextStep: string;
  tasks: TaskCategory;
  messages: Message[];
  actions: MissionAction[];
  documents: MissionDocumentReference[];
};

export const missionOrder: MissionId[] = ["1", "2", "3"];

export const missionSeeds: Record<MissionId, MissionSeed> = {
  "1": {
    id: "1",
    title: "Relocate to South Korea",
    subtitle: "Visa setup, arrival logistics, and first month planning.",
    phase: "Preparation",
    status: "At risk",
    overview:
      "This mission tracks the core relocation timeline, including visa paperwork, finances, and travel booking.",
    nextStep: "Confirm visa submission timing and lock the travel date.",
    tasks: {
      "Visa & Documents": [
        {
          id: "task-1",
          label: "Apply for Student Visa",
          completed: false,
          dueDate: "2026-06-15",
        },
        {
          id: "task-2",
          label: "Gather University Admission Documents",
          completed: true,
          dueDate: "2026-05-30",
        },
        {
          id: "task-3",
          label: "Submit Proof of Financial Sponsorship",
          completed: false,
          dueDate: "2026-06-10",
        },
      ],
      Finances: [
        {
          id: "task-4",
          label: "Pay First Semester Tuition Fees",
          completed: false,
          dueDate: "2026-07-01",
        },
        {
          id: "task-5",
          label: "Open a South Korean Bank Account",
          completed: false,
          dueDate: "2026-08-20",
        },
      ],
      "Travel & Housing": [
        {
          id: "task-6",
          label: "Book Flight to Seoul",
          completed: false,
          dueDate: "2026-07-15",
        },
        {
          id: "task-7",
          label: "Arrange for University Dormitory",
          completed: false,
          dueDate: "2026-06-25",
        },
      ],
    },
    messages: [
      {
        id: "msg-1",
        type: "reasoning",
        text: "Based on your 3-month timeline, I prioritized visa-related tasks because they typically have the longest processing times.",
        timestamp: "May 22, 2026, 10:00 AM",
      },
      {
        id: "msg-5",
        type: "update",
        text: "I analyzed your acceptance letter and added a tuition-related finance task.",
        timestamp: "May 22, 2026, 11:30 AM",
        extractedData: {
          title: "acceptance_letter.pdf",
          data: {
            University: "Seoul National University",
            Program: "MSc Computer Science",
            "Tuition Deadline": "2026-07-01",
            "Reporting Date": "2026-08-25",
          },
        },
      },
      {
        id: "msg-3",
        type: "alert",
        text: "Your visa application should be submitted within the next 10 days to avoid processing delays.",
        timestamp: "May 22, 2026, 10:05 AM",
      },
    ],
    actions: [
      {
        id: "action-1",
        title: "Extracted deadline from acceptance letter",
        details: "Pulled tuition and reporting dates into the mission record.",
        timestamp: "May 22, 2026, 11:30 AM",
      },
      {
        id: "action-2",
        title: "Queued visa checklist review",
        details: "Marked visa-related tasks for earlier attention based on timeline risk.",
        timestamp: "May 22, 2026, 10:05 AM",
      },
    ],
    documents: [
      {
        name: "acceptance_letter.pdf",
        note: "Confirms the university, reporting date, and tuition deadline.",
        href: "/documents",
      },
      {
        name: "financial_statement.pdf",
        note: "Supports the sponsorship and tuition readiness tasks.",
        href: "/documents",
      },
      {
        name: "passport_scan.jpg",
        note: "Referenced in the visa submission checklist.",
        href: "/documents",
      },
    ],
  },
  "2": {
    id: "2",
    title: "Renew Residence Permit",
    subtitle: "Maintain legal stay and complete compliance steps.",
    phase: "Compliance",
    status: "Watch",
    overview:
      "This mission centers on a permit renewal deadline, evidence collection, and compliance follow-up.",
    nextStep: "Collect current permit documents and draft the renewal note.",
    tasks: {
      Compliance: [
        {
          id: "task-8",
          label: "Check permit expiry date",
          completed: false,
          dueDate: "2026-06-05",
        },
        {
          id: "task-9",
          label: "Prepare residence confirmation letter",
          completed: false,
          dueDate: "2026-06-12",
        },
      ],
      Documents: [
        {
          id: "task-10",
          label: "Scan current permit and passport",
          completed: true,
          dueDate: "2026-05-28",
        },
        {
          id: "task-11",
          label: "Submit renewal packet",
          completed: false,
          dueDate: "2026-06-20",
        },
      ],
    },
    messages: [
      {
        id: "msg-21",
        type: "reasoning",
        text: "I’m treating the permit expiry date as the anchor for this mission so nothing slips past the deadline.",
        timestamp: "May 21, 2026, 9:10 AM",
      },
      {
        id: "msg-22",
        type: "suggestion",
        text: "You should keep the current permit scan at the top of the renewal packet for quick verification.",
        timestamp: "May 21, 2026, 9:18 AM",
      },
    ],
    actions: [
      {
        id: "action-21",
        title: "Set renewal deadline anchor",
        details: "Locked the permit expiry date as the primary mission trigger.",
        timestamp: "May 21, 2026, 9:10 AM",
      },
      {
        id: "action-22",
        title: "Highlighted document order",
        details: "Recommended putting the permit scan first in the renewal packet.",
        timestamp: "May 21, 2026, 9:18 AM",
      },
    ],
    documents: [
      {
        name: "permit_scan.pdf",
        note: "Primary reference for renewal submission.",
        href: "/documents",
      },
      {
        name: "housing_confirmation.pdf",
        note: "Helps verify local address requirements.",
        href: "/documents",
      },
    ],
  },
  "3": {
    id: "3",
    title: "Settle Housing & Arrival",
    subtitle: "Move-in logistics, utilities, and first-week setup.",
    phase: "Arrival",
    status: "On track",
    overview:
      "This mission focuses on landing logistics and the first week of setup after arrival.",
    nextStep: "Finalize the dorm move-in checklist and utility setup dates.",
    tasks: {
      Housing: [
        {
          id: "task-12",
          label: "Confirm dorm check-in time",
          completed: false,
          dueDate: "2026-07-05",
        },
        {
          id: "task-13",
          label: "Book airport transfer",
          completed: true,
          dueDate: "2026-07-03",
        },
      ],
      Setup: [
        {
          id: "task-14",
          label: "Arrange mobile plan",
          completed: false,
          dueDate: "2026-07-08",
        },
        {
          id: "task-15",
          label: "Set up local bank account",
          completed: false,
          dueDate: "2026-08-20",
        },
      ],
    },
    messages: [
      {
        id: "msg-31",
        type: "update",
        text: "I mapped your arrival checklist to the move-in timeline and flagged the airport transfer as complete.",
        timestamp: "May 20, 2026, 3:40 PM",
      },
      {
        id: "msg-32",
        type: "suggestion",
        text: "Try confirming the dorm check-in time before booking anything non-refundable.",
        timestamp: "May 20, 2026, 3:50 PM",
      },
    ],
    actions: [
      {
        id: "action-31",
        title: "Mapped arrival checklist",
        details: "Connected airport transfer timing to the move-in timeline.",
        timestamp: "May 20, 2026, 3:40 PM",
      },
      {
        id: "action-32",
        title: "Flagged move-in risk",
        details: "Advised confirming dorm check-in time before any non-refundable booking.",
        timestamp: "May 20, 2026, 3:50 PM",
      },
    ],
    documents: [
      {
        name: "dorm_assignment.pdf",
        note: "Used to confirm move-in timing and room details.",
        href: "/documents",
      },
      {
        name: "travel_itinerary.pdf",
        note: "Supports airport transfer and arrival timing.",
        href: "/documents",
      },
    ],
  },
};

export const missionSummaries = missionOrder.map((id) => missionSeeds[id]);
