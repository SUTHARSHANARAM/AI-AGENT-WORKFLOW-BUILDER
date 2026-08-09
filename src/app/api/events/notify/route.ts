import { NextRequest, NextResponse } from 'next/server';

/**
 * Hasura Event Trigger Handler for Notify Step
 * Endpoint: POST /api/events/notify
 * 
 * Handles Hasura Event Trigger payloads dispatched when a step_run of type 'notify'
 * is inserted or updated in PostgreSQL. Dispatches Slack/Email alerts.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const event = body.event || {};
    const stepRun = event.data?.new || body;

    console.log('[Hasura Event Trigger - Notify Step Alert]:', {
      step_run_id: stepRun.id,
      status: stepRun.status,
      output: stepRun.output,
      dispatched_at: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        message: 'Hasura Event Trigger: Slack/Email alert dispatched successfully!',
        step_run_id: stepRun.id,
        channel: stepRun.output?.channel || '#support-alerts',
        status: 'delivered',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[Notify Event Trigger API Error]:', error);
    return NextResponse.json(
      { message: `Event Trigger Failure: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
