import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { ChatPrompt } from '@microsoft/teams.ai';
import { searchKnowledgeBase } from './knowledge-base.js';
import { createCase, getCase, updateCase } from './cosmos.js';
import { Order, Customer, SupportCase } from './types.js';

// Load mock data
const orders: Order[] = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'mock-orders.json'), 'utf-8')
);
const customers: Customer[] = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'mock-customers.json'), 'utf-8')
);

const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL || 'http://localhost:7071';

function generateCaseId(): string {
  return `case-${randomBytes(4).toString('hex')}`;
}

export function registerTools(
  prompt: ChatPrompt,
  context: { conversationId: string; userId: string; userName: string }
) {
  prompt.function(
    'lookup_order',
    'Look up an order by order ID. Returns order details including items, total, status, and dates.',
    {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The order ID to look up' },
      },
      required: ['order_id'],
    },
    async ({ order_id }: { order_id: string }) => {
      const order = orders.find((o) => o.orderId === order_id);
      if (!order) return JSON.stringify({ error: `Order ${order_id} not found` });
      return JSON.stringify(order);
    }
  );

  prompt.function(
    'lookup_customer',
    'Look up a customer by email address. Returns customer details including name, membership tier, and contact info.',
    {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'The customer email address' },
      },
      required: ['email'],
    },
    async ({ email }: { email: string }) => {
      const customer = customers.find((c) => c.email === email.toLowerCase());
      if (!customer) return JSON.stringify({ error: `Customer with email ${email} not found` });
      return JSON.stringify(customer);
    }
  );

  prompt.function(
    'search_knowledge_base',
    'Search the support knowledge base for articles matching a query. Use this for policy questions, troubleshooting, and general support info.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query keywords' },
      },
      required: ['query'],
    },
    async ({ query }: { query: string }) => {
      return searchKnowledgeBase(query);
    }
  );

  prompt.function(
    'check_case_status',
    'Check the status of a support case by case ID. Returns the current case details and status.',
    {
      type: 'object',
      properties: {
        case_id: { type: 'string', description: 'The case ID (e.g. case-a1b2c3d4)' },
      },
      required: ['case_id'],
    },
    async ({ case_id }: { case_id: string }) => {
      const supportCase = await getCase(case_id);
      if (!supportCase) return JSON.stringify({ error: `Case ${case_id} not found` });
      return JSON.stringify({
        id: supportCase.id,
        status: supportCase.status,
        action: supportCase.action,
        orderId: supportCase.orderId,
        refundAmount: supportCase.refundAmount,
        createdAt: supportCase.createdAt,
        resolution: supportCase.resolution,
      });
    }
  );

  prompt.function(
    'issue_refund',
    'Submit a refund request for an order. This creates a support case that requires supervisor approval. The refund will be processed after approval.',
    {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The order ID to refund' },
        amount: { type: 'number', description: 'The refund amount in dollars' },
        reason: { type: 'string', description: 'The reason for the refund' },
        email: { type: 'string', description: 'The customer email address' },
      },
      required: ['order_id', 'amount', 'reason', 'email'],
    },
    async ({ order_id, amount, reason, email }: { order_id: string; amount: number; reason: string; email: string }) => {
      const caseId = generateCaseId();

      // Save case to Cosmos DB first so the orchestrator's activities can read it
      const supportCase: SupportCase = {
        id: caseId,
        conversationId: context.conversationId,
        userId: context.userId,
        userName: context.userName,
        orderId: order_id,
        customerEmail: email,
        issueDescription: reason,
        action: 'refund',
        refundAmount: amount,
        status: 'pending_approval',
        orchestrationId: '', // will be back-filled after starting orchestration
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createCase(supportCase);

      // Start durable orchestration (case must exist in Cosmos before this)
      const startRes = await fetch(
        `${FUNCTIONS_BASE_URL}/api/orchestrators/supportCaseOrchestrator`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId }),
        }
      );

      if (!startRes.ok) {
        return JSON.stringify({ error: 'Failed to start approval workflow' });
      }

      const orchestration = await startRes.json() as { id: string };
      const orchestrationId = orchestration.id;

      // Back-fill the orchestration ID on the case
      await updateCase(caseId, { orchestrationId });

      console.log(`\n✅ Case created: ${caseId}`);
      console.log(`   Orchestration: ${orchestrationId}`);
      console.log(`   Approve via dashboard at http://localhost:3000`);
      console.log(`   Or via CLI: curl -X POST ${FUNCTIONS_BASE_URL}/api/cases/${caseId}/approve\n`);

      return JSON.stringify({
        caseId,
        status: 'pending_approval',
        message: `Refund of $${amount.toFixed(2)} for order #${order_id} has been submitted for supervisor approval.`,
      });
    }
  );

  prompt.function(
    'escalate_to_human',
    'Escalate an issue to a human supervisor. Use this when the issue cannot be resolved through standard tools and requires human intervention.',
    {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Detailed reason for escalation' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority level' },
      },
      required: ['reason', 'priority'],
    },
    async ({ reason, priority }: { reason: string; priority: string }) => {
      const caseId = generateCaseId();

      // Save case to Cosmos DB first
      const supportCase: SupportCase = {
        id: caseId,
        conversationId: context.conversationId,
        userId: context.userId,
        userName: context.userName,
        orderId: '',
        customerEmail: '',
        issueDescription: `[${priority.toUpperCase()}] ${reason}`,
        action: 'escalation',
        status: 'pending_approval',
        orchestrationId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createCase(supportCase);

      // Start durable orchestration
      const startRes = await fetch(
        `${FUNCTIONS_BASE_URL}/api/orchestrators/supportCaseOrchestrator`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId }),
        }
      );

      if (!startRes.ok) {
        return JSON.stringify({ error: 'Failed to start escalation workflow' });
      }

      const orchestration = await startRes.json() as { id: string };
      const orchestrationId = orchestration.id;

      await updateCase(caseId, { orchestrationId });

      console.log(`\n🔴 Escalation created: ${caseId} (priority: ${priority})`);
      console.log(`   Orchestration: ${orchestrationId}`);
      console.log(`   Review via dashboard at http://localhost:3000\n`);

      return JSON.stringify({
        caseId,
        status: 'pending_approval',
        message: `Issue has been escalated to a human supervisor with ${priority} priority. Case: ${caseId}`,
      });
    }
  );
}
