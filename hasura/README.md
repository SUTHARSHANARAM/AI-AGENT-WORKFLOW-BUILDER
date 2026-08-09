# Hasura GraphQL Metadata & Permissions Configuration

This directory contains version-controlled Hasura v3 metadata and exported JSON configurations for the **AI Agent Workflow Builder**.

## Live Production Deployment

- **Vercel Web App**: [https://ai-agent-workflow-builder-teal.vercel.app/](https://ai-agent-workflow-builder-teal.vercel.app/)
- **Nhost Environment Variable**:
  ```env
  ACTION_BASE_URL=https://ai-agent-workflow-builder-teal.vercel.app
  ```

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

## Hasura Actions Summary

1. **`triggerWorkflowRun(workflow_id: uuid!)`**
   - Handler: `https://ai-agent-workflow-builder-teal.vercel.app/api/actions/trigger-workflow-run`
   - Output: `{ workflow_run_id: uuid!, status: String! }`

2. **`approveStep(step_run_id: uuid!)`**
   - Handler: `https://ai-agent-workflow-builder-teal.vercel.app/api/actions/approve-step`
   - Output: `{ workflow_run_id: uuid!, step_run_id: uuid!, status: String! }`
