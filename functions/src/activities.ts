import { InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

type CaseStatus = 'pending_approval' | 'approved' | 'rejected' | 'completed';

interface UpdateCaseInput {
  caseId: string;
  status: CaseStatus;
  resolution?: string;
}

interface IssueRefundInput {
  caseId: string;
}

interface NotifyBotInput {
  caseId: string;
  message: string;
}

// Singleton Cosmos client — reused across all invocations
const DB_NAME = process.env.COSMOS_DB_NAME || 'support-agent';
const CONTAINER_NAME = process.env.COSMOS_CONTAINER_NAME || 'cases';

const connectionString = process.env.COSMOS_CONNECTION_STRING;
if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING not set');

const client = new CosmosClient(connectionString);
const container = client.database(DB_NAME).container(CONTAINER_NAME);

export async function updateCaseActivity(input: UpdateCaseInput, context: InvocationContext): Promise<void> {
  context.log(`Updating case ${input.caseId} → status: ${input.status}`);

  const { resource: existing } = await container.item(input.caseId, input.caseId).read();
  if (!existing) throw new Error(`Case ${input.caseId} not found`);

  const updated = {
    ...existing,
    status: input.status,
    updatedAt: new Date().toISOString(),
    ...(input.resolution ? { resolution: input.resolution } : {}),
  };
  await container.item(input.caseId, input.caseId).replace(updated);
}

export async function issueRefundActivity(input: IssueRefundInput, context: InvocationContext): Promise<void> {
  context.log(`Processing refund for case ${input.caseId}`);

  const { resource: supportCase } = await container.item(input.caseId, input.caseId).read();
  if (!supportCase) throw new Error(`Case ${input.caseId} not found`);

  // Simulate refund processing (replace with payment provider integration in production)
  context.log(`  Refunding $${supportCase.refundAmount} for order #${supportCase.orderId}`);
  context.log(`  Refund processed successfully (simulated)`);
}

export async function notifyBotActivity(input: NotifyBotInput, context: InvocationContext): Promise<void> {
  context.log(`Notifying bot for case ${input.caseId}: ${input.message}`);

  const { resource: supportCase } = await container.item(input.caseId, input.caseId).read();
  if (!supportCase) throw new Error(`Case ${input.caseId} not found`);

  const botNotifyUrl = process.env.BOT_NOTIFY_URL || 'http://localhost:3980/api/notify';

  const response = await fetch(botNotifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: supportCase.conversationId,
      userId: supportCase.userId,
      message: input.message,
    }),
  });

  if (!response.ok) {
    context.log(`Warning: Bot notification failed with status ${response.status}`);
  }
}
