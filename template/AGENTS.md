# Skyestone AI React Native Architecture & Quality Rules

## 1. Core Guidelines for AI Agents
You are an expert React Native engineer building a production-ready application. 
Strictly follow these rules. DO NOT deviate or introduce unnecessary complexity or messy abstractions.

---

## 2. Architecture & Folder Structure
- **Framework:** Expo Router v3+ (file-based routing under `/app`).
- Keep directory depth minimal and flat:
  - `/app` -> Routes and layouts ONLY.
  - `/src/components` -> Reusable base UI components (`Button.tsx`, `Input.tsx`, `ScreenWrapper.tsx`).
  - `/src/features/auth` -> Auth API calls (`api.ts`) and types (`types.ts`).
  - `/src/store` -> Global Zustand stores and MMKV setup (`authStore.ts`, `mmkv.ts`).
  - `/src/services/api` -> Axios instance (`client.ts`).
  - `/src/theme` -> Design tokens (`config.ts`).
- **Forbidden:** DO NOT create unnecessary `/hooks`, `/controllers`, or nested wrapper folders unless explicitly instructed.

---

## 3. State Management & Network Layer
- **State:** Zustand ONLY.
- **Storage:** `react-native-mmkv` with a custom synchronous Zustand storage adapter.
- **Forbidden:** DO NOT use `AsyncStorage`, Redux, or Context API for persistent state.
- **Network:** Axios instance with request/response interceptors for Bearer tokens and auto-logout on 401 errors.
- **Form Validation:** `react-hook-form` + `zod` schema validation. Raw `useState` for complex form inputs is forbidden.

---

## 4. Definition of Done (DoD)
A feature or module is NOT considered "Complete" until all the following criteria are met:
1. **Zero Linter/Type Errors:** `npx tsc --noEmit` runs clean.
2. **Resilience:** Gracefully handles empty states, slow network latency, 401/403/500 API errors, and offline network transitions.
3. **Adversarial Pass Passed:** The module passes the self-testing protocol below without crashing or leaking state.

---

## 5. Autonomous Penetration & Edge-Case Testing Protocol
After completing the initial implementation of any module, you MUST automatically switch roles and act as an **Adversarial QA / Penetration Tester**.

Self-audit the code against these 4 attack vectors before marking it done:

1. **Input Mashing & Payload Abuse:** 
   - Test unexpected inputs (`null`, `undefined`, massive strings, special characters) in form components and Zustand actions.
   - Ensure inputs fail gracefully with readable UI messages instead of unhandled app crashes.
2. **Race Conditions & Spamming:** 
   - Verify buttons cannot be double-tapped or spammed rapidly (prevent duplicate API network requests).
   - Ensure loading states disable interactive buttons immediately upon press.
3. **Auth & State Security:** 
   - Ensure sensitive tokens or user data are never logged to `console.log` or unhandled error alerts.
   - Verify a 401 Unauthorized API response clears the session state and redirects to `/(auth)/login`.
4. **UI & Safe Areas:** 
   - Ensure layout elements sit safely within device `SafeAreaView` boundaries and respond to dark/light theme tokens cleanly.

> **Mandatory Action:** If you discover a bug or vulnerability during this self-audit, you must fix the code immediately BEFORE marking the task finished.

---

## 6. Autonomous Task Complexity Analysis & Sub-Agent Orchestration

Whenever you receive a feature prompt, module implementation request, or architectural refactor, you MUST evaluate its complexity BEFORE writing code:

1. **Complexity Assessment:**
   - **Single-Scope Task:** Single screen UI, minor bug fix, or simple helper utility → Execute directly as a single agent.
   - **Complex / Multi-Module Task:** Involves multiple full screens, complex state machines, data fetching + form validation + persistence layers, or full feature modules → Automatically break down into sub-agents/sub-tasks.

2. **Sub-Agent Decomposition Strategy:**
   When handling a complex task, divide execution into discrete, non-overlapping worker roles:
   - **Agent A (Data & Domain Layer):** Types, Zod schemas, Zustand stores, MMKV persistence, API interceptors.
   - **Agent B (Atomic UI & Components):** Presentational components, layout wrappers, design token application.
   - **Agent C (Screen Integration & Navigation):** Screen routes under `/app`, form hook binding, navigation flow.
   - **Agent D (Adversarial QA & Self-Audit):** Executes Section 5 vulnerability, input abuse, and race condition tests across all generated code.

3. **Execution Rule:**
   Never attempt to build a complex multi-screen feature in a single unstructured pass. Complete each sub-agent phase sequentially, verifying zero TypeScript errors before delegating to the next phase.
