import { WorkflowStep, StepExecutionResult } from '../types';

/**
 * Replaces handlebar placeholders in templates with context values.
 */
function interpolateText(template: string, context: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_, path) => {
    const keys = path.split('.');
    let val: any = context;
    for (const key of keys) {
      if (val && typeof val === 'object' && key in val) {
        val = val[key];
      } else {
        return `{{${path}}}`;
      }
    }
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

/**
 * Executes a Notify step.
 * Formats a payload compatible with Hasura Event Triggers or external notification dispatchers.
 */
export async function executeNotifyStep(
  step: WorkflowStep,
  input: Record<string, any>
): Promise<StepExecutionResult> {
  const config = step.config || {};
  const channel = config.channel || 'email';
  const rawRecipient = config.recipient || 'system@org.internal';
  const rawMessage = config.message || 'Workflow notification for step {{step.name}}';

  const recipient = interpolateText(rawRecipient, { input, ...input });
  const message = interpolateText(rawMessage, { input, ...input, step: { name: step.name } });

  // Hasura Event Trigger compatible payload structure
  const eventPayload = {
    event: {
      op: 'NOTIFY',
      data: {
        old: null,
        new: {
          channel,
          recipient,
          message,
          step_id: step.id,
          step_name: step.name,
          triggered_at: new Date().toISOString(),
          context: input,
        },
      },
    },
    delivery_info: {
      max_retries: 3,
      current_retry: 0,
    },
  };

  console.log(`[Notify Step] [${channel.toUpperCase()}] To: ${recipient} | Message: ${message}`);

  return {
    status: 'completed',
    output: {
      sent: true,
      channel,
      recipient,
      message,
      eventPayload,
    },
  };
}
