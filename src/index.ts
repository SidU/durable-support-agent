import { App } from '@microsoft/teams.apps';
import { ChatPrompt, Message } from '@microsoft/teams.ai';
import { LocalStorage } from '@microsoft/teams.common/storage';
import { DevtoolsPlugin } from '@microsoft/teams.dev';
import { OpenAIChatModel } from '@microsoft/teams.openai';
import { createServer } from 'http';

import { initCosmos } from './cosmos.js';
import { loadKnowledgeBase } from './knowledge-base.js';
import { registerTools } from './tools.js';

// Initialize external dependencies
initCosmos();
loadKnowledgeBase();

const storage = new LocalStorage<Array<Message>>();

const app = new App({
  storage,
  plugins: [new DevtoolsPlugin()],
});

const SYSTEM_MESSAGE = `You are a helpful support agent for Contoso Electronics. You help customers with order inquiries, returns, refunds, product troubleshooting, and general questions.

When a customer has an issue:
1. Look up their order details using lookup_order if they provide an order number.
2. Look up customer information using lookup_customer if you need their account details.
3. Search the knowledge base using search_knowledge_base for policy and troubleshooting info.
4. If a refund is needed, use issue_refund with the order ID, amount, reason, and customer email.
5. If you cannot resolve the issue, use escalate_to_human with a detailed reason and priority.
6. If asked about a case status, use check_case_status with the case ID.

Always be polite and professional. Explain what you're doing at each step. When a refund or escalation is submitted, inform the customer of their case ID and that it's pending supervisor approval.`;

app.on('message', async ({ stream, activity }) => {
  const storageKey = `${activity.conversation.id}/${activity.from.id}`;

  const prompt = new ChatPrompt({
    instructions: SYSTEM_MESSAGE,
    messages: storage.get(storageKey),
    model: new OpenAIChatModel({
      model: 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY,
    }),
  });

  // Register all support tools
  registerTools(prompt, {
    conversationId: activity.conversation.id,
    userId: activity.from.id,
    userName: activity.from.name || 'Unknown User',
  });

  await prompt.send(activity.text, {
    onChunk: (chunk) => stream.emit(chunk),
  });
});

// Start the Teams bot
app.start(process.env.PORT || 3978).catch(console.error);

// Notification endpoint for proactive messages from Durable Functions
const notifyPort = Number(process.env.NOTIFY_PORT || 3979);
const notifyServer = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/notify') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { conversationId, userId, message } = JSON.parse(body);
        console.log(`📨 Proactive message for ${conversationId}/${userId}: ${message}`);

        // Send proactive message via the bot adapter
        await app.send(conversationId, {
          type: 'message',
          text: message,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('Notify error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to send notification' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

notifyServer.listen(notifyPort, () => {
  console.log(`Notification endpoint listening on port ${notifyPort}`);
});
