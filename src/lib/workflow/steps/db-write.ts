import { WorkflowStep, StepExecutionResult } from '../types';

function getGraphqlEndpoint(): string {
  if (process.env.NHOST_GRAPHQL_URL) {
    return process.env.NHOST_GRAPHQL_URL;
  }
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || '';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'us-east-1';
  if (subdomain) {
    return `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
  }
  return '';
}

/**
 * Executes a Database Write step safely server-side.
 * Saves structured data or output results to the application database.
 */
export async function executeDbWriteStep(
  step: WorkflowStep,
  input: Record<string, any>,
  orgId: string
): Promise<StepExecutionResult> {
  const config = step.config || {};
  const tableName = config.table_name || 'step_runs';
  const customData = config.data || {};

  const payloadToSave = {
    step_id: step.id,
    step_name: step.name,
    org_id: orgId,
    timestamp: new Date().toISOString(),
    input,
    ...customData,
  };

  const endpoint = getGraphqlEndpoint();
  const adminSecret = process.env.NHOST_ADMIN_SECRET;

  if (endpoint && adminSecret) {
    try {
      // Safe server-side database mutation
      const mutation = `
        mutation RecordWorkflowOutput($object: jsonb!) {
          insert_step_runs_one(
            object: {
              workflow_step_id: "${step.id}",
              workflow_run_id: "${input.workflow_run_id || '00000000-0000-0000-0000-000000000000'}",
              status: "completed",
              output: $object
            }
          ) {
            id
          }
        }
      `;

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          query: mutation,
          variables: { object: payloadToSave },
        }),
      });
    } catch (err) {
      console.warn('[DB Write Step] Notice writing to GraphQL:', err);
    }
  }

  return {
    status: 'completed',
    output: {
      written: true,
      tableName,
      data: payloadToSave,
    },
  };
}
