# AI Agent Workflow Builder — Full-Stack Submission

A full-stack, multi-tenant AI Agent Workflow Builder built with **Next.js 16 (App Router)**, **Nhost**, **Hasura GraphQL Engine**, **PostgreSQL**, and **Groq LLM API**.

- **Live Hosted Application**: [https://ai-agent-workflow-builder-kxzaay9x8-sr18.vercel.app/](https://ai-agent-workflow-builder-kxzaay9x8-sr18.vercel.app/)
- **GitHub Repository**: [https://github.com/SUTHARSHANARAM/AI-AGENT-WORKFLOW-BUILDER](https://github.com/SUTHARSHANARAM/AI-AGENT-WORKFLOW-BUILDER)

---

## 🏛️ Architecture & System Design Write-Up

### 1. Data Model Reasoning
The database is structured to support multi-tenant isolation, ordered workflow execution, audit logging, and org quota tracking:

- `organizations`: Stores tenant metadata, `calls_used`, and `calls_allowed` quota limits.
- `org_members`: Maps `user_id` to `org_id` with application roles (`owner`, `editor`, `viewer`).
- `workflows`: Represents workflow definitions belonging to an organization.
- `workflow_steps`: Ordered step definitions (`position`, `type`, `config` JSONB).
- `workflow_triggers`: Defines triggers (`manual`, `webhook`, `scheduled`, `event`).
- `workflow_runs`: Execution runs with status tracking (`pending`, `running`, `paused`, `completed`, `failed`).
- `step_runs`: Execution logs per step per run (`status`, `input`, `output`, `error`, `approved_by`, `approved_at`).
- `org_usage_monthly`: A database view aggregating monthly tenant execution metrics.

---

### 2. Two-Layer Permission Model Enforcement

#### **Layer 1 — Org + Role Scoping (Hasura Row-Level Security)**
Layer 1 is enforced natively at the Hasura GraphQL Engine layer. Every database permission filter checks that the authenticated user (`X-Hasura-User-Id`) belongs to the target resource's organization via `org_members`:
- **`owner`**: Full CRUD permissions over workflows, steps, triggers, and org membership scoped to their org.
- **`editor`**: Create/edit workflows and steps, trigger runs; cannot manage org members.
- **`viewer`**: Read-only access to org resources; cannot trigger runs or modify workflows.
- **Cross-Org Isolation**: An Org B user attempting to query or mutate an Org A resource receives **0 rows** or `Forbidden`, even if they guess the exact UUID.

#### **Layer 2 — Step-Level Gating & Mid-Execution Approvals (Server-Side Action Engine)**
Layer 2 controls mid-execution logic and privileged actions that cannot be solved by database row permissions alone:
- **Approval Gate Pause/Resume**: When `executeWorkflow()` encounters an `approval_gate` step, it updates `step_run.status = 'paused'`, sets `workflow_run.status = 'paused'`, and halts execution.
- **Role Verification on Resume**: The Hasura Action `approveStep(step_run_id)` verifies that the caller is an `owner` or `editor` in that organization via `verifyOrgMember()` and `assertRole()` using server-side admin credentials before setting `approved_by`, `approved_at`, `status = 'completed'`, and resuming execution via `resumeWorkflowRun()`.

---

### 3. Workflow Execution Engine & Step Handlers

1. **`llm_call`**: Executes real AI LLM chat completions using the Groq API (`llama-3.3-70b-versatile`) with dynamic prompt interpolation.
2. **`http_request`**: Dispatches REST API requests (GET/POST/PUT/DELETE) with configurable headers and body payloads.
3. **`conditional_branch`**: Evaluates rules (`equals`, `contains`, `greater_than`, `is_truthy`, etc.) against previous step outputs and dynamically routes execution to `true_step_position` or `false_step_position`.
4. **`approval_gate`**: Returns `paused` status and halts workflow execution until approved by an authorized `owner`/`editor`.
5. **`db_write`**: Safely persists step output records into PostgreSQL database tables.
6. **`notify`**: Formats Slack/Email alert payloads compatible with Hasura Event Triggers.

---

## ⚡ Hasura Action API Endpoints

1. **`triggerWorkflowRun(workflow_id: uuid!)`**  
   - Endpoint: `POST /api/actions/trigger-workflow-run`
   - Scopes caller membership, verifies `owner`/`editor` role, checks org call quota, and starts sequential execution.

2. **`approveStep(step_run_id: uuid!)`**  
   - Endpoint: `POST /api/actions/approve-step`
   - Verifies step is an `approval_gate` in `paused` state, checks caller's `owner`/`editor` role in org, updates approval attributes, and resumes workflow execution.

---

## 🛠️ Local Setup & Running Locally

### Prerequisites
- Node.js 20+
- Nhost Account & Groq API Key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SUTHARSHANARAM/AI-AGENT-WORKFLOW-BUILDER.git
   cd AI-AGENT-WORKFLOW-BUILDER
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables (`.env.local`):
   ```env
   NEXT_PUBLIC_NHOST_SUBDOMAIN=ronqbmjmmogmskjtfjym
   NEXT_PUBLIC_NHOST_REGION=ap-south-1
   NHOST_GRAPHQL_URL=https://ronqbmjmmogmskjtfjym.hasura.ap-south-1.nhost.run/v1/graphql
   NHOST_ADMIN_SECRET=your_nhost_admin_secret
   GROQ_API_KEY=your_groq_api_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.
