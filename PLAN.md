# Velora Development Plan

This document outlines the phased development plan for the Velora project, an adaptive AI coordination agent for life transitions.

### **Phase 1: Setup & Foundation**

*   **Goal**: Establish the project structure and foundational UI components.
*   **Tasks**:
    *   [x] Initialize a Next.js project with TypeScript.
    *   [x] Set up Tailwind CSS for styling.
    *   [x] Integrate `shadcn/ui` for the component library.
    *   [x] Create a basic layout including a sidebar and main content area.
    *   [x] Define a modern, elegant color palette and apply it globally.

### **Phase 2: The "Mission" & Onboarding**

*   **Goal**: Create the initial user experience for starting a new life transition "mission."
*   **Tasks**:
    *   [x] Design and build the "mission onboarding" page (`/start`).
    *   [x] Create a multi-step form to capture initial user input (destination, dates, etc.).
    *   [x] Implement the main mission page (`/mission/[id]`) that will host the dashboard.
    *   [x] Ensure the layout is responsive and works well on mobile.

### **Phase 3: The AI Coordination Feed & Task Management**

*   **Goal**: Build the core UI for displaying the AI's reasoning and the user's tasks.
*   **Tasks**:
    *   [x] Create the `AiMessage` component to display different types of AI outputs (reasoning, alerts, suggestions).
    *   [x] Design the AI Coordination Feed on the main mission page to show a stream of these messages.
    *   [x] Implement the UI for the categorized task list.
    *   [x] Add interactivity to the task list (e.g., checkboxes).
    *   [x] Populate the UI with realistic mock data for a compelling demo.

### **Phase 4: Document Intelligence & Interaction**

*   **Goal**: Create the UI for uploading and displaying information extracted from documents.
*   **Tasks**:
    *   [x] Design a component to represent an uploaded document.
    *   [x] Create the `ExtractedInfo` component to display key-value data extracted by the AI.
    *   [x] Integrate the `ExtractedInfo` component into `AiMessage` to show data in the feed.
    *   [x] Add a "Document Upload" section to the UI (frontend only for now).

### **Phase 5: Adaptive Replanning & Proactive Alerts**

*   **Goal**: Visualize the agent's "smart" capabilities and create a dynamic feel.
*   **Tasks**:
    *   [x] Design UI patterns to show when the timeline is being automatically adjusted (via the AI Reasoning Feed).
    *   [x] Create a notification system UI (a bell icon with a dropdown) for proactive alerts.
    *   [x] Design different styles for alerts based on priority (informational, warning, urgent).

### **Phase 6: Polish & Refinement**

*   **Goal**: Elevate the user experience from functional to delightful.
*   **Tasks**:
    *   [ ] Review and refine all UI components for consistency and aesthetic appeal.
    *   [ ] Add subtle animations and transitions to make the interface feel more responsive and alive.
    *   [ ] Implement loading states (e.g., skeletons or spinners) for a smoother perceived performance.
    *   [ ] Conduct a final review of responsiveness across all target screen sizes.

### **Phase 7: Backend & API Integration (Future)**

*   **Goal**: Connect the frontend prototype to a real, working backend infrastructure.
*   **Tasks**:
    *   [ ] **Memory & Context Awareness (Database)**:
        *   [ ] Integrate a database (e.g., MongoDB) to store user data, mission state, conversation history, and agent reasoning logs for long-term context.
    *   [ ] **Document Intelligence (Backend)**:
        *   [ ] Implement secure file upload handling.
        *   [ ] Integrate an AI service (e.g., Gemini) to extract data from PDFs, images, etc.
        *   [ ] Set up a search layer (e.g., Elastic) for semantic search across all uploaded documents.
    *   [ ] **Adaptive Timeline & Risk Detection Engine**:
        *   [ ] Develop backend logic for the adaptive timeline, allowing downstream tasks to shift automatically.
        *   [ ] Implement a backend agent to proactively monitor timelines, dependencies, and user progress to predict and flag potential risks (e.g., missed deadlines, financial strain).
    *   [ ] **Intelligent Follow-Up & Notification System**:
        *   [ ] Implement a backend service to monitor events and trigger intelligent follow-ups and alerts.
        *   [ ] Integrate a web push notification service (e.g., Firebase Cloud Messaging) for alerts outside the app.
        *   [ ] Integrate an email service (e.g., SendGrid) for email-based notifications.
        *   [ ] (Optional) Explore integrations with messaging platforms like WhatsApp or Telegram.
    *   [ ] **Financial Coordination**:
        *   [ ] Develop backend logic to estimate costs, suggest budgets, and identify financial risks based on user data and mission goals.
    *   [ ] **AI Action Assistant**:
        *   [ ] Build endpoints for the AI to perform actions like drafting emails, summarizing documents, or creating checklists.
    *   [ ] **Core APIs**:
        *   [ ] Develop core APIs for managing missions, tasks, and user data.
        *   [ ] Connect the entire frontend to the AI agent backend.
