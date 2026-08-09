import { WorkflowStep, StepExecutionResult } from '../types';

/**
 * Executes an Approval Gate step.
 * Returns a paused status requiring explicit human approval to resume execution.
 */
export async function executeApprovalStep(
  step: WorkflowStep,
  input: Record<string, any>
): Promise<StepExecutionResult> {
  const config = step.config || {};
  const requiredRole = config.approver_role || 'editor';
  const approvalMessage =
    config.approval_message ||
    `Approval Gate reached for step "${step.name}". Manual approval by an authorized ${requiredRole} is required to continue.`;

  return {
    status: 'paused',
    pauseReason: approvalMessage,
    output: {
      stepId: step.id,
      stepName: step.name,
      requiredRole,
      approvalMessage,
      pendingInput: input,
      requiresApproval: true,
    },
  };
}
