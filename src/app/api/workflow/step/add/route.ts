import { NextRequest, NextResponse } from 'next/server';
import { verifyOrgMember } from '@/lib/workflow/auth';

/**
 * Server-Side Layer 2 Privilege Enforcement Endpoint: Add Step / Trigger
 * Endpoint: POST /api/workflow/step/add
 * 
 * Enforces Layer 2 Security:
 * - db_write -> Owner Only
 * - notify -> Owner Only
 * - webhook trigger -> Owner Only
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, org_id, step_type, step_name, workflow_id } = body;

    if (!user_id || !org_id || !step_type) {
      return NextResponse.json(
        { message: 'Bad Request: Missing required fields user_id, org_id, step_type.' },
        { status: 400 }
      );
    }

    // 1. Verify caller's membership and role in organization from PostgreSQL org_members
    const { role, allowed } = await verifyOrgMember(user_id, org_id);

    if (!allowed || !role) {
      return NextResponse.json(
        { message: 'Unauthorized: You are not a member of this organization.' },
        { status: 403 }
      );
    }

    // 2. Enforce Layer 2 Privilege Rules
    const isOwnerOnly =
      step_type === 'db_write' ||
      step_type === 'notify' ||
      step_type === 'webhook' ||
      step_type === 'webhook_trigger';

    if (isOwnerOnly && role !== 'owner') {
      return NextResponse.json(
        {
          message: `Layer 2 Security Violation: Adding '${step_type}' requires Owner role. Role '${role}' is denied.`,
        },
        { status: 403 }
      );
    }

    // 3. Editor & Owner permitted for standard steps (llm_call, http_request, conditional_branch, approval_gate)
    if (role === 'viewer') {
      return NextResponse.json(
        { message: 'Unauthorized: Viewer role cannot modify or add workflow steps.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        message: `Step '${step_name || step_type}' validated and added successfully!`,
        step_type,
        role_verified: role,
        allowed: true,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /api/workflow/step/add Error]:', error);
    return NextResponse.json(
      { message: `Server error: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
