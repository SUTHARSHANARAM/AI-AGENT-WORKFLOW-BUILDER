/**
 * Hasura Native GraphQL WebSocket Subscription Client
 * Subscribes to live step_runs updates filtered by workflow_run_id
 */
export function subscribeToStepRuns(
  runId: string,
  onData: (stepRuns: any[], runStatus?: string) => void,
  onError?: (err: any) => void
): () => void {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'ronqbmjmmogmskjtfjym';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
  const wsUrl = `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

  let ws: WebSocket | null = null;
  let isCancelled = false;

  try {
    ws = new WebSocket(wsUrl, 'graphql-ws');

    ws.onopen = () => {
      if (isCancelled) return;
      // 1. Connection Init
      ws?.send(
        JSON.stringify({
          type: 'connection_init',
          payload: {
            headers: {
              'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET || 'ziM0t8,8H&q(iU(=r%67ACMc:k:MnVhk',
            },
          },
        })
      );

      // 2. Start GraphQL Subscription
      ws?.send(
        JSON.stringify({
          id: 'step_runs_subscription',
          type: 'start',
          payload: {
            query: `
              subscription StepRuns($runId: uuid!) {
                step_runs(
                  where: { workflow_run_id: { _eq: $runId } }
                  order_by: { created_at: asc }
                ) {
                  id
                  workflow_run_id
                  workflow_step_id
                  status
                  input
                  output
                  error
                  attempt_count
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
                workflow_runs_by_pk(id: $runId) {
                  id
                  status
                  error
                }
              }
            `,
            variables: { runId },
          },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data' && msg.payload?.data) {
          const stepRuns = msg.payload.data.step_runs || [];
          const runStatus = msg.payload.data.workflow_runs_by_pk?.status;
          onData(stepRuns, runStatus);
        }
      } catch (e) {
        if (onError) onError(e);
      }
    };

    ws.onerror = (err) => {
      if (onError) onError(err);
    };
  } catch (err) {
    if (onError) onError(err);
  }

  // Cleanup function
  return () => {
    isCancelled = true;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: 'step_runs_subscription', type: 'stop' }));
      ws.close();
    }
  };
}
