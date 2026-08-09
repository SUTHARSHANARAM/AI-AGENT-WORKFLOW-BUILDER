import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow, getWorkflowWithSteps } from '@/lib/workflow/executor';
import { checkOrgQuota } from '@/lib/workflow/quota';

/**
 * Non-Manual Trigger Handler: Inbound Webhook Trigger
 * Endpoint: POST /api/triggers/webhook
 * 
 * Allows external systems / webhooks to trigger workflow execution automatically
 * without requiring a manual button click in the UI.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workflow_id, payload } = body;

    if (!workflow_id) {
      return NextResponse.json(
        { message: 'Bad Request: Missing required workflow_id in webhook body.' },
        { status: 400 }
      );
    }

    // 1. Fetch workflow and verify existence
    let workflow;
    try {
      workflow = await getWorkflowWithSteps(workflow_id);
    } catch (err: any) {
      return NextResponse.json(
        { message: `Workflow not found: ${err.message}` },
        { status: 404 }
      );
    }

    // 2. Check organization quota
    const quota = await checkOrgQuota(workflow.org_id);
    if (!quota.hasQuota) {
      return NextResponse.json(
        { message: `Quota Exhausted: Organization has used ${quota.callsUsed}/${quota.callsAllowed} allowed calls.` },
        { status: 429 }
      );
    }

    // 3. Execute Workflow automatically via webhook trigger
    const run = await executeWorkflow({
      workflowId: workflow_id,
      triggerType: 'webhook',
      initialInput: payload || { source: 'webhook_inbound', received_at: new Date().toISOString() },
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
