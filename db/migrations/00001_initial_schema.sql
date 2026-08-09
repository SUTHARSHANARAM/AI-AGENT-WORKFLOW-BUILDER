-- Migration: 00001_initial_schema.sql
-- Description: Initial PostgreSQL schema for AI Agent Workflow Builder (Nhost Production Ready)
-- Features: Organizations, Members, Workflows, Steps, Triggers, Runs, Step Runs, and Monthly Usage View

-- Enable pgcrypto extension for cryptographic functions and UUID support
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. ORGANIZATIONS
-- Stores tenant organizations, call quotas, and usage periods.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  calls_used INTEGER NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  calls_allowed INTEGER NOT NULL DEFAULT 1000 CHECK (calls_allowed >= 0),
  usage_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. ORG_MEMBERS
-- Maps Nhost auth users to organizations with role-based access.
-- Roles: owner, editor, viewer
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_org_members_org_user UNIQUE (org_id, user_id)
);

-- ============================================================================
-- 3. WORKFLOWS
-- Stores workflow metadata owned by organizations.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. WORKFLOW_STEPS
-- Individual steps inside a workflow sequence.
-- Types: llm_call, http_request, db_write, notify, conditional_branch, approval_gate
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'llm_call',
      'http_request',
      'db_write',
      'notify',
      'conditional_branch',
      'approval_gate'
    )
  ),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_workflow_steps_position UNIQUE (workflow_id, position)
);

-- ============================================================================
-- 5. WORKFLOW_TRIGGERS
-- Defines execution triggers for a workflow.
-- Types: manual, webhook, scheduled, database_event
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('manual', 'webhook', 'scheduled', 'database_event')
  ),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. WORKFLOW_RUNS
-- Execution instances of a workflow.
-- Statuses: pending, running, paused, completed, failed
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN ('manual', 'webhook', 'scheduled', 'database_event')
  ),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'paused', 'completed', 'failed')
  ),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. STEP_RUNS
-- Individual step execution records within a workflow run.
-- Statuses: pending, running, paused, completed, failed
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'paused', 'completed', 'failed')
  ),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. VIEW: ORG_USAGE_MONTHLY
-- Aggregates monthly API call usage per organization.
-- ============================================================================
CREATE OR REPLACE VIEW public.org_usage_monthly AS
SELECT 
  id AS org_id,
  name AS org_name,
  calls_used,
  calls_allowed,
  GREATEST(calls_allowed - calls_used, 0) AS calls_remaining,
  CASE 
    WHEN calls_allowed > 0 THEN ROUND((calls_used::numeric / calls_allowed::numeric) * 100, 2)
    ELSE 100.00
  END AS usage_percentage,
  usage_period_start,
  created_at,
  updated_at
FROM public.organizations;

-- ============================================================================
-- 9. INDEXES
-- Performance optimizations for foreign keys, queries, and filters.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id);

CREATE INDEX IF NOT EXISTS idx_workflows_org_id ON public.workflows(org_id);
CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON public.workflows(created_by);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON public.workflow_steps(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow_id ON public.workflow_triggers(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON public.workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON public.workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_triggered_by ON public.workflow_runs(triggered_by);

CREATE INDEX IF NOT EXISTS idx_step_runs_workflow_run_id ON public.step_runs(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_workflow_step_id ON public.step_runs(workflow_step_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_status ON public.step_runs(status);
CREATE INDEX IF NOT EXISTS idx_step_runs_approved_by ON public.step_runs(approved_by);

-- ============================================================================
-- 10. AUTOMATIC UPDATED_AT TRIGGER FUNCTION
-- Automatically updates updated_at column on row modifications.
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON public.workflows;
CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_workflow_steps_updated_at ON public.workflow_steps;
CREATE TRIGGER trg_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
