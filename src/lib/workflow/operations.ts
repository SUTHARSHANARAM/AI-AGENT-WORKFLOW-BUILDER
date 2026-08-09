/**
 * GraphQL Operations Module
 * Contains native Hasura GraphQL queries & mutations for Workflow Management
 */

function getGraphqlEndpoint(): string {
  if (process.env.NHOST_GRAPHQL_URL) {
    return process.env.NHOST_GRAPHQL_URL.replace('.graphql.', '.hasura.');
  }
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'ronqbmjmmogmskjtfjym';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
  return `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
}

async function queryGraphQL(query: string, variables: Record<string, any> = {}) {
  const endpoint = getGraphqlEndpoint();
  const adminSecret = process.env.NHOST_ADMIN_SECRET || 'ziM0t8,8H&q(iU(=r%67ACMc:k:MnVhk';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

/**
 * GraphQL Mutation: Create / Edit Workflow, Workflow Steps & Triggers in Hasura PostgreSQL
 * Exact assignment requirement: "A mutation to create/edit a workflow, its steps, and its triggers"
 */
export async function saveWorkflowMutation(workflowData: {
  id?: string;
  org_id: string;
  name: string;
  description?: string;
  created_by?: string;
  steps?: Array<{
    id?: string;
    position: number;
    name: string;
    type: string;
    config: Record<string, any>;
  }>;
  triggers?: Array<{
    id?: string;
    type: string;
    config?: Record<string, any>;
  }>;
}) {
  const mutation = `
    mutation SaveWorkflowWithStepsAndTriggers(
      $workflow: workflows_insert_input!
    ) {
      insert_workflows_one(
        object: $workflow
        on_conflict: {
          constraint: workflows_pkey
          update_columns: [name, description]
        }
      ) {
        id
        org_id
        name
        description
        created_at
        updated_at
      }
    }
  `;

  const formattedSteps = (workflowData.steps || []).map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    position: s.position,
    name: s.name,
    type: s.type,
    config: s.config || {},
  }));

  const formattedTriggers = (workflowData.triggers || []).map((t) => ({
    ...(t.id ? { id: t.id } : {}),
    type: t.type,
    config: t.config || {},
  }));

  const objectPayload: Record<string, any> = {
    ...(workflowData.id ? { id: workflowData.id } : {}),
    org_id: workflowData.org_id,
    name: workflowData.name,
    description: workflowData.description || '',
    ...(workflowData.created_by ? { created_by: workflowData.created_by } : {}),
    workflow_steps: {
      data: formattedSteps,
      on_conflict: {
        constraint: 'workflow_steps_pkey',
        update_columns: ['position', 'name', 'type', 'config'],
      },
    },
    workflow_triggers: {
      data: formattedTriggers,
      on_conflict: {
        constraint: 'workflow_triggers_pkey',
        update_columns: ['type', 'config'],
      },
    },
  };

  const data = await queryGraphQL(mutation, { workflow: objectPayload });
  return data?.insert_workflows_one;
}
