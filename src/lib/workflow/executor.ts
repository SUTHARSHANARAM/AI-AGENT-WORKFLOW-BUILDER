import {
  Workflow,
  WorkflowStep,
  WorkflowRun,
  StepRun,
  RunStatus,
  ExecuteWorkflowOptions,
  StepExecutionResult,
} from './types';
import { checkOrgQuota, incrementOrgQuota } from './quota';
import { executeLlmStep } from './steps/llm';
import { executeHttpStep } from './steps/http';
import { executeConditionalStep } from './steps/conditional';
import { executeApprovalStep } from './steps/approval';
import { executeDbWriteStep } from './steps/db-write';
import { executeNotifyStep } from './steps/notify';

function getGraphqlEndpoint(): string {
  if (process.env.NHOST_GRAPHQL_URL) {
    return process.env.NHOST_GRAPHQL_URL;
  }
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || '';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'us-east-1';
  if (subdomain) {
    return `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
  }
  return '';
}

function getRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (adminSecret) {
    headers['x-hasura-admin-secret'] = adminSecret;
  }
  return headers;
}

async function queryGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const endpoint = getGraphqlEndpoint();
  if (!endpoint) {
    throw new Error('GraphQL endpoint is not configured.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request error: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }

  return json.data;
}

/**
 * Fetches workflow and steps ordered by position ASC.
 */
export async function getWorkflowWithSteps(workflowId: string): Promise<Workflow> {
  const query = `
    query GetWorkflow($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        id
        org_id
        name
        description
        created_by
        created_at
        updated_at
        steps: workflow_steps(order_by: { position: asc }) {
          id
          workflow_id
          position
          name
          type
          config
          created_at
          updated_at
        }
      }
    }
  `;

  const data = await queryGraphQL(query, { workflowId });
  const workflow = data?.workflows_by_pk;

  if (!workflow) {
    throw new Error(`Workflow with ID "${workflowId}" not found.`);
  }

  return workflow;
}

/**
 * Creates a new workflow_run record.
 */
async function createWorkflowRun(
  workflowId: string,
  triggeredByUserId?: string,
  triggerType: string = 'manual'
): Promise<WorkflowRun> {
  const mutation = `
    mutation CreateWorkflowRun($workflowId: uuid!, $triggeredBy: uuid, $triggerType: String!) {
      insert_workflow_runs_one(object: {
        workflow_id: $workflowId,
        triggered_by: $triggeredBy,
        trigger_type: $triggerType,
        status: "running",
        started_at: "now()"
      }) {
        id
        workflow_id
        triggered_by
        trigger_type
        status
        started_at
        created_at
      }
    }
  `;

  const data = await queryGraphQL(mutation, {
    workflowId,
    triggeredBy: triggeredByUserId || null,
    triggerType,
  });

  return data.insert_workflow_runs_one;
}

/**
 * Updates a workflow_run status and error/completed_at timestamp.
 */
async function updateWorkflowRunStatus(
  runId: string,
  status: RunStatus,
  errorText?: string
): Promise<WorkflowRun> {
  const completedAt = ['completed', 'failed', 'paused'].includes(status) ? new Date().toISOString() : null;

  const mutation = `
    mutation UpdateWorkflowRunStatus($runId: uuid!, $status: String!, $error: String, $completedAt: timestamptz) {
      update_workflow_runs_by_pk(
        pk_columns: { id: $runId },
        _set: {
          status: $status,
          error: $error,
          completed_at: $completedAt
        }
      ) {
        id
        workflow_id
        status
        error
        started_at
        completed_at
        created_at
      }
    }
  `;

  const data = await queryGraphQL(mutation, {
    runId,
    status,
    error: errorText || null,
    completedAt,
  });

  return data.update_workflow_runs_by_pk;
}

/**
 * Creates a step_run record.
 */
async function createStepRun(
  workflowRunId: string,
  stepId: string,
  inputData: Record<string, any>
): Promise<StepRun> {
  const mutation = `
    mutation CreateStepRun($workflowRunId: uuid!, $stepId: uuid!, $input: jsonb!) {
      insert_step_runs_one(object: {
        workflow_run_id: $workflowRunId,
        workflow_step_id: $stepId,
        status: "running",
        input: $input,
        started_at: "now()"
      }) {
        id
        workflow_run_id
        workflow_step_id
        status
        input
        output
        attempt_count
        created_at
      }
    }
  `;

  const data = await queryGraphQL(mutation, {
    workflowRunId,
    stepId,
    input: inputData,
  });

  return data.insert_step_runs_one;
}

/**
 * Updates a step_run record with output, status, and optional approval.
 */
async function updateStepRun(
  stepRunId: string,
  status: RunStatus,
  outputData: Record<string, any>,
  errorText?: string,
  approvedBy?: string,
  approvedAt?: string
): Promise<StepRun> {
  const completedAt = ['completed', 'failed', 'paused'].includes(status) ? new Date().toISOString() : null;

  const mutation = `
    mutation UpdateStepRun(
      $stepRunId: uuid!,
      $status: String!,
      $output: jsonb!,
      $error: String,
      $approvedBy: uuid,
      $approvedAt: timestamptz,
      $completedAt: timestamptz
    ) {
      update_step_runs_by_pk(
        pk_columns: { id: $stepRunId },
        _set: {
          status: $status,
          output: $output,
          error: $error,
          approved_by: $approvedBy,
          approved_at: $approvedAt,
          completed_at: $completedAt
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        output
        error
        approved_by
        approved_at
        created_at
      }
    }
  `;

  const data = await queryGraphQL(mutation, {
    stepRunId,
    status,
    output: outputData,
    error: errorText || null,
    approvedBy: approvedBy || null,
    approvedAt: approvedAt || null,
    completedAt,
  });

  return data.update_step_runs_by_pk;
}

/**
 * Dispatches step execution to the correct step type executor module.
 */
async function dispatchStepExecution(
  step: WorkflowStep,
  input: Record<string, any>,
  orgId: string
): Promise<StepExecutionResult> {
  switch (step.type) {
    case 'llm_call':
      return executeLlmStep(step, input);

    case 'http_request':
      return executeHttpStep(step, input);

    case 'conditional_branch':
      return executeConditionalStep(step, input);

    case 'approval_gate':
      return executeApprovalStep(step, input);

    case 'db_write':
      return executeDbWriteStep(step, input, orgId);

    case 'notify':
      return executeNotifyStep(step, input);

    default:
      return {
        status: 'failed',
        output: {},
        error: `Unsupported step type: "${step.type}"`,
      };
  }
}

/**
 * Executes a workflow sequentially from position 1 to completion or approval pause.
 */
export async function executeWorkflow(options: ExecuteWorkflowOptions): Promise<WorkflowRun> {
  const { workflowId, triggeredByUserId, triggerType = 'manual', initialInput = {} } = options;

  // 1. Fetch workflow metadata and steps
  const workflow = await getWorkflowWithSteps(workflowId);
  const steps = workflow.steps || [];

  if (steps.length === 0) {
    throw new Error(`Workflow "${workflow.name}" has no defined steps to execute.`);
  }

  // 2. Check organization API call quota
  const quota = await checkOrgQuota(workflow.org_id);
  if (!quota.hasQuota) {
    throw new Error(
      `Organization quota exhausted (${quota.callsUsed}/${quota.callsAllowed} calls used). Upgrade quota to run workflows.`
    );
  }

  // 3. Create workflow_run record
  const run = await createWorkflowRun(workflowId, triggeredByUserId, triggerType);

  let accumulatorInput: Record<string, any> = { ...initialInput, workflow_run_id: run.id };
  let currentStepIndex = 0;

  try {
    while (currentStepIndex < steps.length) {
      const step = steps[currentStepIndex];

      // Create step_run record
      const stepRun = await createStepRun(run.id, step.id, accumulatorInput);

      // Execute step logic
      const result = await dispatchStepExecution(step, accumulatorInput, workflow.org_id);

      if (result.status === 'paused') {
        // Step hit an approval gate
        await updateStepRun(stepRun.id, 'paused', result.output, undefined);
        const updatedRun = await updateWorkflowRunStatus(
          run.id,
          'paused',
          result.pauseReason || 'Approval Gate reached. Awaiting manual approval.'
        );
        return updatedRun;
      }

      if (result.status === 'failed') {
        // Step execution failed
        await updateStepRun(stepRun.id, 'failed', result.output, result.error);
        const updatedRun = await updateWorkflowRunStatus(
          run.id,
          'failed',
          result.error || `Step "${step.name}" failed.`
        );
        return updatedRun;
      }

      // Step completed successfully
      await updateStepRun(stepRun.id, 'completed', result.output);

      // Accumulate output for subsequent steps
      accumulatorInput = {
        ...accumulatorInput,
        [`step_${step.position}`]: result.output,
        last_output: result.output,
      };

      // Branching logic for conditional steps
      if (result.nextStepPosition !== undefined && result.nextStepPosition !== null) {
        const targetIndex = steps.findIndex((s) => s.position === Number(result.nextStepPosition));
        if (targetIndex !== -1) {
          currentStepIndex = targetIndex;
          continue;
        }
      }

      currentStepIndex++;
    }

    // 4. All steps completed successfully
    const finalRun = await updateWorkflowRunStatus(run.id, 'completed');

    // 5. Increment organization quota usage
    await incrementOrgQuota(workflow.org_id);

    return finalRun;
  } catch (err: any) {
    console.error(`[Workflow Executor] Execution error for run ${run.id}:`, err);
    return await updateWorkflowRunStatus(run.id, 'failed', err.message || String(err));
  }
}

/**
 * Resumes a paused workflow run after an approval gate is granted.
 */
export async function resumeWorkflowRun(
  workflowRunId: string,
  approvedByUserId: string
): Promise<WorkflowRun> {
  const runQuery = `
    query GetRun($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        id
        workflow_id
        status
        workflow {
          id
          org_id
          name
          steps(order_by: { position: asc }) {
            id
            workflow_id
            position
            name
            type
            config
            created_at
            updated_at
          }
        }
        step_runs(order_by: { created_at: asc }) {
          id
          workflow_step_id
          status
          input
          output
        }
      }
    }
  `;

  const data = await queryGraphQL(runQuery, { runId: workflowRunId });
  const run = data?.workflow_runs_by_pk;

  if (!run) {
    throw new Error(`Workflow run "${workflowRunId}" not found.`);
  }

  if (run.status !== 'paused') {
    throw new Error(`Workflow run "${workflowRunId}" is not paused (current status: ${run.status}).`);
  }

  const steps: WorkflowStep[] = run.workflow?.steps || [];
  const stepRuns: StepRun[] = run.step_runs || [];

  // Find paused step run
  const pausedStepRun = stepRuns.find((sr) => sr.status === 'paused');
  if (!pausedStepRun) {
    throw new Error(`No paused step run found for workflow run "${workflowRunId}".`);
  }

  const pausedStep = steps.find((s) => s.id === pausedStepRun.workflow_step_id);
  if (!pausedStep) {
    throw new Error(`Corresponding workflow step not found for step run "${pausedStepRun.id}".`);
  }

  // Update paused step_run to completed with approval metadata
  const approvalOutput = {
    ...pausedStepRun.output,
    approved: true,
    approved_by: approvedByUserId,
    approved_at: new Date().toISOString(),
  };

  await updateStepRun(
    pausedStepRun.id,
    'completed',
    approvalOutput,
    undefined,
    approvedByUserId,
    new Date().toISOString()
  );

  // Update workflow_run status to running
  await updateWorkflowRunStatus(run.id, 'running');

  let accumulatorInput: Record<string, any> = {
    ...pausedStepRun.input,
    approved_by: approvedByUserId,
    approval_result: approvalOutput,
  };

  const startStepIndex = steps.findIndex((s) => s.position === pausedStep.position) + 1;
  let currentStepIndex = startStepIndex;

  try {
    while (currentStepIndex < steps.length) {
      const step = steps[currentStepIndex];

      const stepRun = await createStepRun(run.id, step.id, accumulatorInput);
      const result = await dispatchStepExecution(step, accumulatorInput, run.workflow.org_id);

      if (result.status === 'paused') {
        await updateStepRun(stepRun.id, 'paused', result.output, undefined);
        return await updateWorkflowRunStatus(run.id, 'paused', result.pauseReason);
      }

      if (result.status === 'failed') {
        await updateStepRun(stepRun.id, 'failed', result.output, result.error);
        return await updateWorkflowRunStatus(run.id, 'failed', result.error);
      }

      await updateStepRun(stepRun.id, 'completed', result.output);
      accumulatorInput = {
        ...accumulatorInput,
        [`step_${step.position}`]: result.output,
        last_output: result.output,
      };

      if (result.nextStepPosition !== undefined && result.nextStepPosition !== null) {
        const targetIndex = steps.findIndex((s) => s.position === Number(result.nextStepPosition));
        if (targetIndex !== -1) {
          currentStepIndex = targetIndex;
          continue;
        }
      }

      currentStepIndex++;
    }

    // All remaining steps completed
    const finalRun = await updateWorkflowRunStatus(run.id, 'completed');
    await incrementOrgQuota(run.workflow.org_id);

    return finalRun;
  } catch (err: any) {
    console.error(`[Workflow Executor] Error resuming run ${run.id}:`, err);
    return await updateWorkflowRunStatus(run.id, 'failed', err.message || String(err));
  }
}
