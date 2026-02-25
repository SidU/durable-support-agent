import { OrchestrationContext, OrchestrationHandler } from 'durable-functions';

export const supportCaseOrchestrator: OrchestrationHandler = function* (context: OrchestrationContext) {
  const input = context.df.getInput<{ caseId: string }>();
  const caseId = input.caseId;

  if (!context.df.isReplaying) {
    context.log(`Orchestration started for case: ${caseId}`);
  }

  // Step 1: Ensure case is marked as pending_approval
  yield context.df.callActivity('updateCase', {
    caseId,
    status: 'pending_approval',
  });

  // Step 2: Wait for external approval event (pauses here — costs nothing)
  const approvalResult = yield context.df.waitForExternalEvent('Approval');
  const approved = (approvalResult as { approved: boolean }).approved;

  if (approved) {
    // Step 3a: Approved — update status, process refund, notify bot
    yield context.df.callActivity('updateCase', {
      caseId,
      status: 'approved',
    });

    yield context.df.callActivity('issueRefund', { caseId });

    yield context.df.callActivity('updateCase', {
      caseId,
      status: 'completed',
      resolution: 'Approved and processed by supervisor',
    });

    yield context.df.callActivity('notifyBot', {
      caseId,
      message: `Your support case ${caseId} has been approved and processed. The refund will appear on your account within 5-7 business days.`,
    });

    return { caseId, result: 'approved' };
  } else {
    // Step 3b: Rejected — update status, notify bot
    yield context.df.callActivity('updateCase', {
      caseId,
      status: 'rejected',
      resolution: 'Rejected by supervisor',
    });

    yield context.df.callActivity('notifyBot', {
      caseId,
      message: `Your support case ${caseId} has been reviewed and was not approved. Please contact support for more information.`,
    });

    return { caseId, result: 'rejected' };
  }
};
