import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow, getWorkflowWithSteps } from '@/lib/workflow/executor';
import { checkOrgQuota } from '@/lib/workflow/quota';

/**
 * Trigger Type 4: Hasura Database Event Trigger Handler
 * Endpoint: POST /api/triggers/event
 * 
 * Ingests row mutation events (INSERT/UPDATE on watched database tables)
 * from Hasura Event Triggers to auto-start workflow runs.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { event, table, workflow_id } = body;

    // Default to seeded demo workflow if not explicitly passed in payload
    const targetWorkflowId = workflow_id || '10010010-1001-1001-1001-100100100100';

    // 1. Fetch workflow metadata
    const workflow = await getWorkflowWithSteps(targetWorkflowId);

    // 2. Verify org quota
    const quota = await checkOrgQuota(workflow.org_id);
    if (!quota.hasQuota) {
      return NextResponse.json(
        { message: `Quota Exhausted: Organization has used ${quota.callsUsed}/${quota.callsAllowed} calls.` },
        { status: 429 }
      );
    }

    // 3. Execute Workflow automatically via Database Row Change Event
    const run = await executeWorkflow({
      workflowId: targetWorkflowId,
      triggerType: 'database_event',
      initialInput: {
        table_name: table?.name || 'customer_tickets',
        op: event?.op || 'INSERT',
        data: event?.data?.new || body,
        triggered_at: new Date().toISOString(),
      },
    });

    return NextResponse.json(
      {
        message: 'Database Event Trigger executed workflow run successfully!',
        workflow_run_id: run.id,
        status: run.status,
        trigger_type: 'database_event',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Database Event Trigger API Error]:', error);
    return NextResponse.json(
      { message: `Database Event Execution Failure: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
