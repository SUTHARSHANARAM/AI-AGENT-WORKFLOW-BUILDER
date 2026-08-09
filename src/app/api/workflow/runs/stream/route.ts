import { NextRequest } from 'next/server';

function getGraphqlEndpoint(): string {
  if (process.env.NHOST_GRAPHQL_URL) {
    return process.env.NHOST_GRAPHQL_URL.replace('.graphql.', '.hasura.');
  }
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'ronqbmjmmogmskjtfjym';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
  return `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
}

/**
 * Server-Sent Events (SSE) Stream Endpoint for Live Step Runs Updates
 * GET /api/workflow/runs/stream?run_id=UUID
 * 
 * Streams step_runs timeline changes live to the browser UI without page refresh.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('run_id');

  if (!runId) {
    return new Response('Missing run_id query parameter', { status: 400 });
  }

  const encoder = new TextEncoder();
  const endpoint = getGraphqlEndpoint();
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) {
    return new Response('NHOST_ADMIN_SECRET is not configured', { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const fetchStepRuns = async () => {
        if (isClosed) return;
        try {
          const query = `
            query GetLiveStepRuns($runId: uuid!) {
              workflow_runs_by_pk(id: $runId) {
                id
                status
                error
                started_at
                completed_at
                step_runs(order_by: { created_at: asc }) {
                  id
                  workflow_step_id
                  status
                  output
                  error
                  approved_by
                  approved_at
                  created_at
                  workflow_step {
                    id
                    position
                    name
                    type
                  }
                }
              }
            }
          `;

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hasura-admin-secret': adminSecret,
            },
            body: JSON.stringify({ query, variables: { runId } }),
          });

          if (response.ok) {
            const data = await response.json();
            const runData = data?.data?.workflow_runs_by_pk;
            if (runData) {
              const eventPayload = `data: ${JSON.stringify(runData)}\n\n`;
              controller.enqueue(encoder.encode(eventPayload));
            }
          }
        } catch (err) {
          console.error('[SSE Stream Error]:', err);
        }
      };

      // Initial push
      await fetchStepRuns();

      // Interval stream updates every 1.5 seconds
      const interval = setInterval(async () => {
        if (isClosed) {
          clearInterval(interval);
          return;
        }
        await fetchStepRuns();
      }, 1500);

      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
