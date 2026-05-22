# Velora Development Plan

This document outlines the systematic development phases for building Velora, an adaptive AI coordination agent. The primary goal is to create a sleek, modern, and elegant user interface focused on the core use case: International Student Relocation.

---

### **Phase 1: Setup & Foundation**

*   **Goal**: Establish a clean project structure and define the visual identity of the application.
*   **Tasks**:
    *   [x] Consolidate all source code into the `src` directory.
    *   [ ] Define UI/UX fundamentals:
        *   Establish a primary color palette, accent colors, and neutral shades.
        *   Choose typography (fonts, sizes, weights) for headings and body text.
        *   Design the main application layout (e.g., sidebar navigation, main content area, header).
*   [x] Build the static shell for the main dashboard layout using `shadcn/ui` components.
*   [x] Create a `components/layout` directory for reusable layout components (e.g., `Sidebar`, `Header`, `PageWrapper`).

---

### **Phase 2: The "Mission" & Onboarding**

*   **Goal**: Create the initial user experience where a user defines their transition goal.
*   **Tasks**:
    *   [x] Design and build a simple, elegant onboarding page or modal.
    *   [x] Implement a text input area for the user to describe their mission (e.g., "I’m moving from Uganda to South Korea for university in 3 months.").
*   [x] Create the UI for the AI's initial response, which presents the generated master plan and timeline. This should feel intelligent and reassuring.
*   [x] Design the transition from onboarding to the main dashboard.

---

### **Phase 3: The AI Coordination Feed & Task Management**

*   **Goal**: Develop the core dashboard interface where the user interacts with the AI and their tasks.
*   **Tasks**:
    *   [x] Design the "AI Coordination Feed," which will be the central, scrollable area displaying AI messages, insights, and reasoning.
    *   [x] Create distinct UI components for different types of AI messages (e.g., suggestions, risk alerts, status updates).
    *   [x] Build the UI for displaying categorized task lists (e.g., "Visa & Documents," "Finance," "Travel").
    *   [x] Implement interactive task items with checkboxes, due dates, and status indicators.

---

### **Phase 4: Document Intelligence & Interaction**

*   **Goal**: Build the interface for document handling and information extraction.
*   **Tasks**:
    *   [ ] Design a clean and simple UI for uploading files (PDFs, images).
    *   [ ] Create a "Documents" view or section where users can see all their uploaded files.
    *   [ ] Design how extracted information is presented back to the user. For example, an AI message in the feed saying, "I've analyzed your acceptance letter. The tuition deadline is August 15th. I've added it to your timeline."

---

### **Phase 5: Adaptive Replanning & Proactive Alerts**

*   **Goal**: Visualize the agent's "smart" capabilities and create a dynamic feel.
*   **Tasks**:
    *   [ ] Design UI patterns to show when the timeline is being automatically adjusted. This could be a subtle animation or an explicit message from the AI.
    *   [ ] Create a notification system UI (e.g., a bell icon with a dropdown) for proactive alerts.
    *   [ ] Design different styles for alerts based on priority (informational, warning, urgent). Example: "Heads up: Your visa application window opens in 3 days."

---

### **Phase 6: Polish & Refinement**

*   **Goal**: Elevate the application from functional to delightful.
*   **Tasks**:
    *   [ ] Review and refine all UI components for consistency and aesthetic appeal.
    *   [ ] Add subtle animations and transitions to make the interface feel fluid and responsive.
    *   [ ] Implement loading states for data fetching and AI processing to manage user expectations.
    *   [ ] Design and implement empty states for when there are no tasks, documents, or notifications.
    *   [ ] Ensure the entire application is fully responsive and looks great on both desktop and mobile devices.
