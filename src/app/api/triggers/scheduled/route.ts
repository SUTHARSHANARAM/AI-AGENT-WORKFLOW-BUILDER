import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow, getWorkflowWithSteps } from '@/lib/workflow/executor';
import { checkOrgQuota } from '@/lib/workflow/quota';

/**
 * Trigger Type 3: Cron / Scheduled Trigger Handler
 * Endpoint: POST /api/triggers/scheduled
 * 
 * Invoked on a recurring cron schedule (via Nhost Scheduled Functions or cron trigger)
 * to start workflow execution automatically without human intervention.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workflow_id, schedule_name } = body;

    if (!workflow_id) {
      return NextResponse.json(
        { message: 'Bad Request: Missing required workflow_id in scheduled trigger body.' },
        { status: 400 }
      );
    }

    // 1. Fetch workflow metadata
    const workflow = await getWorkflowWithSteps(workflow_id);

    // 2. Verify org quota
    const quota = await checkOrgQuota(workflow.org_id);
    if (!quota.hasQuota) {
      return NextResponse.json(
        { message: `Quota Exhausted: Organization has used ${quota.callsUsed}/${quota.callsAllowed} calls.` },
        { status: 429 }
      );
    }

    // 3. Execute Workflow automatically via cron schedule
    const run = await executeWorkflow({
      workflowId: workflow_id,
      triggerType: 'scheduled',
      initialInput: { schedule_name: schedule_name || 'daily_nightly_cron', triggered_at: new Date().toISOString() },
    });

    return NextResponse.json(
      {
        message: 'Scheduled cron trigger executed successfully!',
        workflow_run_id: run.id,
        status: run.status,
        trigger_type: 'scheduled',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Scheduled Trigger API Error]:', error);
    return NextResponse.json(
      { message: `Scheduled Execution Failure: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
