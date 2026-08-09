/**
 * AI Agent Workflow Builder - Type Definitions
 */

export type OrgRole = 'owner' | 'editor' | 'viewer';

export type StepType =
  | 'llm_call'
  | 'http_request'
  | 'db_write'
  | 'notify'
  | 'conditional_branch'
  | 'approval_gate';

export type TriggerType = 'manual' | 'webhook' | 'scheduled' | 'database_event';

export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface Organization {
  id: string;
  name: string;
  calls_used: number;
  calls_allowed: number;
  usage_period_start: string;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface WorkflowStepConfig {
  // LLM Step Configuration
  model?: string;
  prompt?: string;
  temperature?: number;
  max_tokens?: number;

  // HTTP Step Configuration
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url?: string;
  headers?: Record<string, string>;
  body?: any;

  // DB Write Step Configuration
  table_name?: string;
  data?: Record<string, any>;

  // Notify Step Configuration
  channel?: 'email' | 'webhook' | 'slack';
  recipient?: string;
  message?: string;

  // Conditional Step Configuration
  field?: string;
  operator?:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'is_truthy'
    | 'is_falsy';
  value?: any;
  true_step_position?: number;
  false_step_position?: number;

  // Approval Gate Step Configuration
  approver_role?: OrgRole;
  approval_message?: string;

  [key: string]: any;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  position: number;
  name: string;
  type: StepType;
  config: WorkflowStepConfig;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTrigger {
  id: string;
  workflow_id: string;
  type: TriggerType;
  config: Record<string, any>;
  enabled: boolean;
  created_at: string;
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  steps?: WorkflowStep[];
  triggers?: WorkflowTrigger[];
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  triggered_by?: string | null;
  trigger_type: TriggerType;
  status: RunStatus;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  created_at: string;
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  status: RunStatus;
  input: Record<string, any>;
  output: Record<string, any>;
  error?: string | null;
  attempt_count: number;
  approved_by?: string | null;
  approved_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface StepExecutionResult {
  status: RunStatus;
  output: Record<string, any>;
  error?: string;
  pauseReason?: string;
  nextStepPosition?: number;
}

export interface ExecuteWorkflowOptions {
  workflowId: string;
  triggeredByUserId?: string;
  triggerType?: TriggerType;
  initialInput?: Record<string, any>;
}
