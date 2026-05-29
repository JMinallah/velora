## Minimal AI Assistant Dashboard Layout (Centered Design)

### Overall Design Style

A **clean, modern, centered AI dashboard** with lots of breathing space, soft rounded corners, subtle shadows, and a calm professional feel.
The design should follow the **project theme colors** consistently throughout all buttons, highlights, borders, hover states, and icons.

The page should feel:

* Minimal
* Friendly
* Lightweight
* Modern SaaS-style
* Mobile responsive
* Focused entirely on conversation

---

# Layout Structure

## 1. Main Container

The entire dashboard content should be perfectly centered both horizontally and visually balanced vertically.

### Container Characteristics

* Max width: around **700px–900px**
* Responsive on mobile/tablet
* Soft rounded corners (`20px+`)
* Subtle shadow or glassmorphism effect
* Background should follow:

  * either plain neutral color
  * or very light gradient using project theme colors

---

# 2. Top Greeting Section

Centered at the top.

### Contains:

#### Logo Area

* Small modern logo/icon
* Circular or minimal geometric design
* Should use the project theme color

#### Greeting Text

Example:

> “Hey, Jovia 👋”

Secondary text:

> “What would you like to create today?”

Typography:

* Bold modern font
* Large heading
* Softer smaller subtitle underneath
* High spacing for clean appearance

---

# 3. Chat Input Card (Main Focus)

This should be the largest visual element on the page.

### Input Container

A modern rounded rectangle card centered on the page.

Features:

* Multi-line expandable textarea
* Placeholder text:

  > “Ask anything...”
* Rounded corners (`24px+`)
* Soft border
* Very subtle shadow
* Smooth hover/focus animations

### Inside the Input Area

#### Left Bottom Actions

Small minimal icon buttons:

* 📷 Image upload
* 📄 File upload

Design:

* Outline style icons
* Circular background on hover
* Small tooltip labels

#### Right Bottom Action

Main send button:

* Floating circular send button
* Uses project theme primary color
* Arrow/send icon centered
* Slight glow or elevation effect

---

# 4. Suggested Prompt Cards Section

Below the chat box.

### Layout

Three centered minimal cards.

Example prompts:

* “Generate UI ideas”
* “Summarize a document”
* “Help me write code”

### Card Style

* Small rounded cards
* Equal spacing
* Hover animation:

  * slight lift
  * border glow
* Minimal icons optional
* Use muted neutral colors with project accent highlights

---

# 5. Background & Visual Feel

Keep the background extremely clean.

Suggestions:

* Soft gradient blur shapes in corners
* Faint grid/noise texture
* Large whitespace
* Avoid clutter

The assistant area should feel:

* intelligent
* calm
* productive
* futuristic without overdoing effects

---

# Recommended UI Details

## Typography

Use modern fonts like:

* Inter
* Poppins
* Manrope
* SF Pro

---

# Spacing Suggestions

Use generous spacing:

* `24px–40px` section gaps
* Avoid crowded elements
* Keep everything breathable

---

# Animations

Very subtle only:

* Fade-in on page load
* Smooth hover transitions
* Input glow on focus
* Prompt cards slightly scale on hover

---

# Minimal Feature Suggestions

## Optional Features

You can add:

* Voice input icon
* Dark/light mode toggle
* Typing indicator animation
* Recent chats sidebar (collapsible)
* AI model selector dropdown

But:

> Keep them hidden/minimal so the interface stays clean.

---

# Responsive Mobile Behavior

On mobile:

* Stack prompt cards vertically
* Keep send/upload icons inside input area
* Maintain centered layout
* Reduce padding slightly

---

# Suggested Component Hierarchy

```text
Dashboard Wrapper
 └── Centered Main Container
      ├── Logo
      ├── Greeting Section
      ├── Chat Input Card
      │     ├── Textarea
      │     ├── Image Upload Button
      │     ├── File Upload Button
      │     └── Send Button
      └── Suggested Prompt Cards
```

---

# Suggested UX Improvements

## 1. Smart Placeholder Rotation

Rotate placeholder text every few seconds:

* “Ask anything...”
* “Generate ideas...”
* “Upload a file to analyze...”
* “Create something amazing...”

---

## 2. Empty State Design

When there are no chats yet:

* Keep interface vertically centered
* Avoid showing unnecessary panels

This creates a premium AI experience similar to modern assistants.

---

## 3. Upload Interaction

When user uploads a file/image:

* Show tiny rounded preview chips below input
* Minimal removable tags

Example:

```text
[ design.png ✕ ]   [ report.pdf ✕ ]
```

---

# Final Design Direction

The dashboard should feel like:

* ChatGPT + Notion AI + Linear combined
* Simple at first glance
* Powerful underneath
* Elegant and distraction-free

The key principle:

> “Minimal, centered, intelligent, and smooth.”
