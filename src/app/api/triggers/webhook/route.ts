import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow, getWorkflowWithSteps } from '@/lib/workflow/executor';
import { checkOrgQuota } from '@/lib/workflow/quota';
import { verifyOrgMember } from '@/lib/workflow/auth';

/**
 * Non-Manual Trigger Handler: Inbound Webhook Trigger
 * Endpoint: POST /api/triggers/webhook
 * 
 * Enforces role authorization & org quota before starting execution.
 * Viewers are strictly denied.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workflow_id, user_id, payload } = body;

    if (!workflow_id) {
      return NextResponse.json(
        { message: 'Bad Request: Missing required workflow_id in webhook body.' },
        { status: 400 }
      );
    }

    // 1. Fetch workflow metadata
    let workflow;
    try {
      workflow = await getWorkflowWithSteps(workflow_id);
    } catch (err: any) {
      return NextResponse.json(
        { message: `Workflow not found: ${err.message}` },
        { status: 404 }
      );
    }

    // 2. Role Verification if user_id is provided
    if (user_id) {
      const { role, allowed } = await verifyOrgMember(user_id, workflow.org_id);
      if (!allowed || role === 'viewer') {
        return NextResponse.json(
          { message: `Unauthorized: Viewer role (User ${user_id.slice(0, 8)}) is read-only and cannot trigger runs.` },
          { status: 403 }
        );
      }
    }

    // 3. Check organization quota
    const quota = await checkOrgQuota(workflow.org_id);
    if (!quota.hasQuota) {
      return NextResponse.json(
        { message: `Quota Exhausted: Organization has used ${quota.callsUsed}/${quota.callsAllowed} allowed calls.` },
        { status: 429 }
      );
    }

    // 4. Execute Workflow automatically via webhook trigger
    const run = await executeWorkflow({
      workflowId: workflow_id,
      triggerType: 'webhook',
      initialInput: payload || { ticketText: 'URGENT: High latency in DB connection pool!', source: 'webhook_inbound' },
    });

    return NextResponse.json(
      {
        message: 'Webhook trigger processed successfully!',
        workflow_run_id: run.id,
        status: run.status,
        trigger_type: 'webhook',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Webhook Trigger API Error]:', error);
    return NextResponse.json(
      { message: `Webhook Execution Failure: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
