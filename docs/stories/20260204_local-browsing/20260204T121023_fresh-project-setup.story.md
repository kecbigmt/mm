## Story Log

### Goal
Bootstrap a Fresh v2.2 project for the local browsing UI and add a `deno task dev` command to start the development server.

### Why
The local-browsing epic requires a web UI for browsing mm workspace nodes. Fresh is a web framework for Deno that provides SSR + islands architecture, which aligns with our "SSR-first, islands for interactivity" design goal. Setting up the Fresh project is the foundation for all subsequent UI stories.

### User Story
**As a mm developer, I want a Fresh dev server task, so that I can start building the local browsing UI.**

### Acceptance Criteria

#### 1. Fresh Project Structure
- [ ] **Given** the mm repository, **When** you check the `fresh/` directory, **Then** it contains `main.ts`, `fresh.config.ts`, and `routes/` directory
- [ ] **Given** the `fresh/` directory exists, **When** you check `fresh.config.ts`, **Then** it configures Fresh with the project root pointing to the Fresh directory

#### 2. Development Task
- [ ] **Given** `deno.json` exists, **When** you run `deno task dev`, **Then** the Fresh development server starts on `http://localhost:8000`
- [ ] **Given** the Fresh server is running, **When** you access `http://localhost:8000`, **Then** you see a placeholder page indicating the local browsing UI

#### 3. Index Route
- [ ] **Given** the Fresh server is running, **When** you access `http://localhost:8000/`, **Then** you see a welcome page with a title "mm Local Browser" and navigation hints

#### 4. Error Cases
- [ ] **Given** port 8000 is already in use, **When** you run `deno task dev`, **Then** an appropriate error message is displayed (Fresh default behavior)

### Out of Scope
- Actual route implementations (`/d/:date`, `/i/:id`, etc.) – those are separate stories
- In-memory index building – that's Story 2
- Styling and visual polish – that's Story 9
- Any workspace reading or item display

---

### Completed Work Summary
Not yet started.

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- [List what the developer manually verified]
- [Note any observations or findings]

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- None yet

#### Remaining
- Fresh v2.2 API may have changed; verify against latest documentation
- Consider if `fresh/` should be a separate Deno workspace or integrated with main project
