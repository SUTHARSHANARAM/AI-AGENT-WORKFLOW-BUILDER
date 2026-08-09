import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowWithSteps, executeWorkflow } from '@/lib/workflow/executor';
import { verifyOrgMember, assertRole } from '@/lib/workflow/auth';
import { checkOrgQuota } from '@/lib/workflow/quota';

/**
 * Hasura Action Handler: triggerWorkflowRun(workflow_id)
 * Endpoint: POST /api/actions/trigger-workflow-run
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Support both Hasura Action format { input: { workflow_id } } and direct JSON { workflow_id }
    const workflowId = body?.input?.workflow_id || body?.workflow_id;

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

    if (!workflowId) {
      return NextResponse.json(
        { message: 'Bad Request: Missing required workflow_id parameter.' },
        { status: 400 }
      );
    }

    // 1. Verify workflow existence and fetch organization context
    let workflow;
    try {
      workflow = await getWorkflowWithSteps(workflowId);
    } catch (err: any) {
      return NextResponse.json(
        { message: `Workflow not found: ${err.message}` },
        { status: 404 }
      );
    }

    // 2. Verify caller's organization membership (prevents cross-org access)
    const { role, allowed } = await verifyOrgMember(userId, workflow.org_id);
    if (!allowed || !role) {
      return NextResponse.json(
        { message: 'Unauthorized: You are not a member of this organization.' },
        { status: 403 }
      );
    }

    // 3. Enforce Role Authorization (owner or editor allowed; viewer denied)
    const isAuthorized = assertRole(role, ['owner', 'editor']);
    if (!isAuthorized) {
      return NextResponse.json(
        { message: `Unauthorized: Role '${role}' cannot trigger workflows. Only owner or editor roles can trigger executions.` },
        { status: 403 }
      );
    }

    // 4. Check Organization API Quota
    const quota = await checkOrgQuota(workflow.org_id);
    if (!quota.hasQuota) {
      return NextResponse.json(
        { message: `Quota Exhausted: Organization has used ${quota.callsUsed}/${quota.callsAllowed} allowed calls.` },
        { status: 429 }
      );
    }

    // 5. Trigger Workflow Execution
    const run = await executeWorkflow({
      workflowId,
      triggeredByUserId: userId,
      triggerType: 'manual',
    });

    // 6. Return Hasura Action Output Payload
    return NextResponse.json(
      {
        workflow_run_id: run.id,
        status: run.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Action triggerWorkflowRun] Execution Error:', error);
    return NextResponse.json(
      { message: `Execution Failure: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
