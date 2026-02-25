import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { supportCaseOrchestrator } from './orchestrator';
import { updateCaseActivity, issueRefundActivity, notifyBotActivity } from './activities';

// Register the orchestrator
df.app.orchestration('supportCaseOrchestrator', supportCaseOrchestrator);

// Register activities
df.app.activity('updateCase', { handler: updateCaseActivity });
df.app.activity('issueRefund', { handler: issueRefundActivity });
df.app.activity('notifyBot', { handler: notifyBotActivity });

// HTTP starter — starts a new orchestration instance
app.http('startOrchestration', {
  route: 'orchestrators/{orchestratorName}',
  methods: ['POST'],
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(context);
    const orchestratorName = req.params.orchestratorName;

    const body = (await req.json()) as Record<string, unknown>;
    if (!body.caseId || typeof body.caseId !== 'string') {
      return { status: 400, jsonBody: { error: 'Missing required field: caseId' } };
    }

    const instanceId = await client.startNew(orchestratorName, {
      instanceId: body.caseId,
      input: body,
    });

    context.log(`Started orchestration '${orchestratorName}' with ID '${instanceId}'`);

    return {
      status: 200,
      jsonBody: { id: instanceId },
    };
  },
});

// HTTP endpoint to raise approval event
app.http('approveCase', {
  route: 'cases/{caseId}/approve',
  methods: ['POST'],
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(context);
    const caseId = req.params.caseId;

    const status = await client.getStatus(caseId);
    if (!status || !status.instanceId) {
      return { status: 404, jsonBody: { error: `No orchestration found for case ${caseId}` } };
    }

    await client.raiseEvent(caseId, 'Approval', { approved: true });

    context.log(`Approved case ${caseId}`);

    return { status: 200, jsonBody: { ok: true, caseId, action: 'approved' } };
  },
});

// HTTP endpoint to raise rejection event
app.http('rejectCase', {
  route: 'cases/{caseId}/reject',
  methods: ['POST'],
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(context);
    const caseId = req.params.caseId;

    const status = await client.getStatus(caseId);
    if (!status || !status.instanceId) {
      return { status: 404, jsonBody: { error: `No orchestration found for case ${caseId}` } };
    }

    await client.raiseEvent(caseId, 'Approval', { approved: false });

    context.log(`Rejected case ${caseId}`);

    return { status: 200, jsonBody: { ok: true, caseId, action: 'rejected' } };
  },
});
