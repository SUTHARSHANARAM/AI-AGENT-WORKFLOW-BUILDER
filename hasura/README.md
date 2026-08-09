# Hasura GraphQL Metadata & Permissions Configuration

This directory contains version-controlled Hasura v3 metadata and exported JSON configurations for the **AI Agent Workflow Builder**.

## Files Created

- [`hasura/hasura_metadata.json`](file:///c:/Users/Sutharshanaram/Desktop/ai-agent-workflow-builder/hasura/hasura_metadata.json): Complete unified Hasura metadata payload.
- [`hasura/metadata/`](file:///c:/Users/Sutharshanaram/Desktop/ai-agent-workflow-builder/hasura/metadata/): Standard Hasura CLI v3 directory layout (`version.yaml`, `databases/`, etc.).

---

## Hasura Relationships Summary

1. **`organizations`**
   - `members` (Array → `org_members.org_id`)
   - `workflows` (Array → `workflows.org_id`)

2. **`org_members`**
   - `organization` (Object → `organizations.id`)
   - `user` (Object → `auth.users.id`)

3. **`workflows`**
   - `organization` (Object → `organizations.id`)
   - `creator` (Object → `auth.users.id`)
   - `steps` (Array → `workflow_steps.workflow_id`)
   - `triggers` (Array → `workflow_triggers.workflow_id`)
   - `runs` (Array → `workflow_runs.workflow_id`)

4. **`workflow_steps`**
   - `workflow` (Object → `workflows.id`)
   - `step_runs` (Array → `step_runs.workflow_step_id`)

5. **`workflow_triggers`**
   - `workflow` (Object → `workflows.id`)

6. **`workflow_runs`**
   - `workflow` (Object → `workflows.id`)
   - `step_runs` (Array → `step_runs.workflow_run_id`)
   - `triggered_user` (Object → `auth.users.id`)

7. **`step_runs`**
   - `workflow_run` (Object → `workflow_runs.id`)
   - `workflow_step` (Object → `workflow_steps.id`)
   - `approver` (Object → `auth.users.id`)

8. **`org_usage_monthly`**
   - `organization` (Manual Object → `organizations.id` mapping `org_id -> id`)

---

## Layer 1 Permission Filters Summary

### Role: `owner`
- Full `select`, `insert`, `update`, `delete` permissions scoped to their organization (`members.user_id = X-Hasura-User-Id` AND `members.role = owner`).
- Only `owner` can insert/update/delete `org_members` (member management).

### Role: `editor`
- Read (`select`) workflows, steps, triggers, and runs in their organization (`organization.members.user_id = X-Hasura-User-Id`).
- `insert` and `update` workflows, steps, and triggers in their organization.
- `update` `step_runs` (e.g. approving approval gates).
- Cannot insert, update, or delete `org_members`.

### Role: `viewer`
- Read-only (`select`) access to workflows, steps, triggers, runs, step runs, and monthly usage in their organization.
- No `insert`, `update`, or `delete` privileges.

---

## How to Apply in Nhost / Hasura Console

1. Open your **Nhost Dashboard** → Select project **AI Agent Workflow** → **GraphQL** → **Hasura Console** (or **Data** tab in Nhost).
2. Go to **Data** → **public** schema → Click **Track All** tables and views (`organizations`, `org_members`, `workflows`, `workflow_steps`, `workflow_triggers`, `workflow_runs`, `step_runs`, `org_usage_monthly`).
3. Click **Track All Foreign Key Relationships**.
4. In **Hasura Metadata** setting / CLI, apply [`hasura_metadata.json`](file:///c:/Users/Sutharshanaram/Desktop/ai-agent-workflow-builder/hasura/hasura_metadata.json).
