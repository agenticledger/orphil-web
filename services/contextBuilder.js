const prisma = require('./db');
const { getRagContext } = require('./ragService');
const { getMemoryRecall } = require('./memoryService');

async function buildContext(params) {
  const agent = await prisma.agent.findUnique({
    where: { id: params.agentId },
    include: {
      agentDocuments: {
        where: { docType: 'soul' },
        take: 1,
      },
    },
  });

  if (!agent) throw new Error('Agent not found');

  const features = agent.features || {};
  let systemPrompt;

  if (features.memoryEnabled && agent.agentDocuments.length > 0) {
    systemPrompt = agent.agentDocuments[0].content;
  } else if (agent.instructions) {
    systemPrompt = agent.instructions;
  } else {
    systemPrompt = `You are ${agent.name}, an AI assistant. Be helpful, concise, and accurate.`;
  }

  systemPrompt += '\n\n--- Platform Context ---';
  systemPrompt += '\nYou are running inside the Orphil advisory platform.';
  systemPrompt += '\nYou are an AI assistant for Orphil LLC (Ore Phillips Advisory) — an AI Transformation Partner for Finance, Accounting & Consulting Firms.';

  // RAG context injection
  if (features.ragEnabled && params.openaiApiKey) {
    try {
      const ragContext = await getRagContext(params.agentId, params.userMessage, params.openaiApiKey);
      if (ragContext) {
        systemPrompt += ragContext;
      }
    } catch (err) {
      console.error('RAG context injection error:', err.message);
    }
  }

  // Memory recall injection
  if (features.memoryEnabled && params.openaiApiKey) {
    try {
      const memoryContext = await getMemoryRecall(params.agentId, params.userMessage, params.openaiApiKey);
      if (memoryContext) {
        systemPrompt += memoryContext;
      }
    } catch (err) {
      console.error('Memory recall error:', err.message);
    }
  }

  // Load conversation history
  const history = await prisma.message.findMany({
    where: { conversationId: params.conversationId },
    orderBy: { createdAt: 'asc' },
    take: params.historyLimit || 50,
  });

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of history) {
    if (msg.role === 'system') continue;
    const metadata = msg.metadata || {};
    messages.push({
      role: msg.role,
      content: msg.content,
      toolCallId: metadata.toolCallId,
      toolCalls: metadata.toolCalls,
    });
  }

  messages.push({
    role: 'user',
    content: params.userMessage,
    ...(params.images && params.images.length > 0 ? { images: params.images } : {}),
  });

  return {
    messages,
    model: agent.defaultModel || 'claude-sonnet-4-6',
  };
}

module.exports = { buildContext };
