import { NextRequest, NextResponse } from 'next/server';
import { resumeWorkflowRun } from '@/lib/workflow/executor';
import { verifyOrgMember, assertRole } from '@/lib/workflow/auth';

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

/**
 * Hasura Action Handler: approveStep(step_run_id)
 * Endpoint: POST /api/actions/approve-step
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Support both Hasura Action format { input: { step_run_id } } and direct JSON { step_run_id }
    const stepRunId = body?.input?.step_run_id || body?.step_run_id;

    // Extract authenticated user ID from headers or Hasura session_variables
    const userId =
      req.headers.get('x-hasura-user-id') ||
      body?.session_variables?.['x-hasura-user-id'];

    if (!userId) {
      return NextResponse.json(
        { message: 'Unauthenticated: Missing user authentication credentials.' },
        { status: 401 }
      );
    }

    if (!stepRunId) {
      return NextResponse.json(
        { message: 'Bad Request: Missing required step_run_id parameter.' },
        { status: 400 }
      );
    }

    const endpoint = getGraphqlEndpoint();
    if (!endpoint) {
      return NextResponse.json(
        { message: 'Server Error: GraphQL endpoint not configured.' },
        { status: 500 }
      );
    }

    // 1. Fetch step_run details following relationship: step_run -> workflow_run -> workflow -> organization
    const query = `
      query GetStepRunDetails($stepRunId: uuid!) {
        step_runs_by_pk(id: $stepRunId) {
          id
          status
          workflow_run_id
          workflow_step_id
          workflow_step {
            id
            type
            name
          }
          workflow_run {
            id
            workflow_id
            status
            workflow {
              id
              org_id
              name
            }
          }
        }
      }
    `;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ query, variables: { stepRunId } }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { message: `GraphQL fetch error: ${response.statusText}` },
        { status: 500 }
      );
    }

    const gqlResult = await response.json();
    const stepRun = gqlResult?.data?.step_runs_by_pk;

    if (!stepRun) {
      return NextResponse.json(
        { message: `Step run with ID '${stepRunId}' not found.` },
        { status: 404 }
      );
    }

    const workflow = stepRun.workflow_run?.workflow;
    if (!workflow || !workflow.org_id) {
      return NextResponse.json(
        { message: 'Orphaned step run: Associated workflow or organization context missing.' },
        { status: 404 }
      );
    }

    // 2. Verify caller belongs to the target organization (prevents cross-org access)
    const { role, allowed } = await verifyOrgMember(userId, workflow.org_id);
    if (!allowed || !role) {
      return NextResponse.json(
        { message: 'Unauthorized: Cross-organization access denied. You are not a member of this organization.' },
        { status: 403 }
      );
    }

    // 3. Enforce Role Authorization (owner or editor allowed; viewer denied)
    const isAuthorized = assertRole(role, ['owner', 'editor']);
    if (!isAuthorized) {
      return NextResponse.json(
        { message: `Unauthorized: Role '${role}' cannot approve workflow steps. Only owner or editor roles can approve.` },
        { status: 403 }
      );
    }

    // 4. Verify the referenced step type is exactly approval_gate
    if (stepRun.workflow_step?.type !== 'approval_gate') {
      return NextResponse.json(
        { message: `Invalid step type: Step '${stepRun.workflow_step?.name || stepRun.workflow_step_id}' is a '${stepRun.workflow_step?.type}', not an 'approval_gate'.` },
        { status: 400 }
      );
    }

    // 5. Verify step_run status is paused
    if (stepRun.status !== 'paused') {
      return NextResponse.json(
        { message: `Step run is not paused (current status: '${stepRun.status}'). Cannot approve an unpaused step.` },
        { status: 400 }
      );
    }

    // 6. Execute Approval & Resume Workflow Run
    const resumedRun = await resumeWorkflowRun(stepRun.workflow_run_id, userId);

    // 7. Return Hasura Action Output Payload
    return NextResponse.json(
      {
        workflow_run_id: resumedRun.id,
        step_run_id: stepRun.id,
        status: resumedRun.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Action approveStep] Execution Error:', error);
    return NextResponse.json(
      { message: `Execution Failure: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
