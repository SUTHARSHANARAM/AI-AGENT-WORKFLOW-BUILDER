import { NextRequest, NextResponse } from 'next/server';
import { saveWorkflowMutation } from '@/lib/workflow/operations';
import { verifyOrgMember } from '@/lib/workflow/auth';

/**
 * GraphQL Workflow Save API Route
 * Endpoint: POST /api/workflow/save
 * 
 * Invokes native Hasura GraphQL mutation SaveWorkflowWithStepsAndTriggers to create or edit
 * a workflow, its ordered workflow_steps, and its workflow_triggers in PostgreSQL.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, org_id, workflow } = body;

    if (!user_id || !org_id || !workflow) {
      return NextResponse.json(
        { message: 'Bad Request: Missing required user_id, org_id, or workflow object.' },
        { status: 400 }
      );
    }

    // 1. Verify user membership & role from PostgreSQL org_members
    const { role, allowed } = await verifyOrgMember(user_id, org_id);

    if (!allowed || role === 'viewer') {
      return NextResponse.json(
        { message: 'Unauthorized: Viewer role is read-only and cannot create or edit workflows.' },
        { status: 403 }
      );
    }

    // 2. Execute GraphQL Mutation
    const saved = await saveWorkflowMutation({
      id: workflow.id,
      org_id,
      name: workflow.name,
      description: workflow.description,
      created_by: user_id,
      steps: workflow.steps || [],
      triggers: workflow.triggers || [{ type: 'manual' }, { type: 'webhook' }],
    });

    return NextResponse.json(
      {
        message: 'Workflow, steps, and triggers saved successfully via Hasura GraphQL mutation!',
        workflow: saved,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[GraphQL Save Workflow Error]:', error);
    return NextResponse.json(
      { message: `GraphQL Mutation Error: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
