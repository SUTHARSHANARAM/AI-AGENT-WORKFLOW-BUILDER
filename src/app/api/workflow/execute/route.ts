import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow, getWorkflowWithSteps } from '@/lib/workflow/executor';
import { verifyOrgMember, assertRole } from '@/lib/workflow/auth';
import { checkOrgQuota } from '@/lib/workflow/quota';

/**
 * API Route: Direct Workflow Execution Trigger for Client UI
 * Endpoint: POST /api/workflow/execute
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workflow_id, user_id, input } = body;

    if (!workflow_id || !user_id) {
      return NextResponse.json(
        { message: 'Missing required parameters: workflow_id, user_id' },
        { status: 400 }
      );
    }

    // 1. Fetch workflow and verify organization context
    let workflow;
    try {
      workflow = await getWorkflowWithSteps(workflow_id);
    } catch (err: any) {
      return NextResponse.json(
        { message: `Workflow not found: ${err.message}` },
        { status: 404 }
      );
    }

    // 2. Verify membership in organization
    const { role, allowed } = await verifyOrgMember(user_id, workflow.org_id);
    if (!allowed || !role) {
      return NextResponse.json(
        { message: 'Unauthorized: Cross-organization execution denied.' },
        { status: 403 }
      );
    }

    // 3. Enforce Role Authorization (owner or editor allowed; viewer denied)
    const isAuthorized = assertRole(role, ['owner', 'editor']);
    if (!isAuthorized) {
      return NextResponse.json(
        { message: `Unauthorized: Role '${role}' cannot trigger execution. Only owner or editor roles can trigger runs.` },
        { status: 403 }
      );
    }

    // 4. Check Organization Quota
    const quota = await checkOrgQuota(workflow.org_id);
    if (!quota.hasQuota) {
      return NextResponse.json(
        { message: `Quota Exhausted: Organization has used ${quota.callsUsed}/${quota.callsAllowed} allowed calls.` },
        { status: 429 }
      );
    }

    // 5. Execute Workflow
    const run = await executeWorkflow({
      workflowId: workflow_id,
      triggeredByUserId: user_id,
      triggerType: 'manual',
      initialInput: input || {},
    });

    return NextResponse.json({
      workflow_run_id: run.id,
      status: run.status,
      started_at: run.started_at,
      completed_at: run.completed_at,
      error: run.error,
    });
  } catch (error: any) {
    console.error('[API /api/workflow/execute] Error:', error);
    return NextResponse.json(
      { message: `Execution error: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
