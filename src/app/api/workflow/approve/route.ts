import { NextRequest, NextResponse } from 'next/server';
import { resumeWorkflowRun } from '@/lib/workflow/executor';
import { verifyOrgMember, assertRole } from '@/lib/workflow/auth';

/**
 * API Route: Resume a Paused Workflow Run after Approval Gate Resolution
 * Endpoint: POST /api/workflow/approve
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workflow_run_id, user_id, org_id } = body;

    if (!workflow_run_id || !user_id || !org_id) {
      return NextResponse.json(
        { message: 'Missing required parameters: workflow_run_id, user_id, org_id' },
        { status: 400 }
      );
    }

    // 1. Verify user membership in organization
    const { role, allowed } = await verifyOrgMember(user_id, org_id);
    if (!allowed || !role) {
      return NextResponse.json(
        { message: 'Unauthorized: User is not a member of this organization.' },
        { status: 403 }
      );
    }

    // 2. Enforce Role Authorization (owner or editor allowed; viewer denied)
    const isAuthorized = assertRole(role, ['owner', 'editor']);
    if (!isAuthorized) {
      return NextResponse.json(
        { message: `Unauthorized: Role '${role}' cannot approve workflows. Owner or Editor required.` },
        { status: 403 }
      );
    }

    // 3. Resume Workflow Run
    const run = await resumeWorkflowRun(workflow_run_id, user_id);

    return NextResponse.json({
      workflow_run_id: run.id,
      status: run.status,
      message: 'Workflow run successfully resumed!',
    });
  } catch (error: any) {
    console.error('[API /api/workflow/approve] Error:', error);
    return NextResponse.json(
      { message: `Failed to resume workflow: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
