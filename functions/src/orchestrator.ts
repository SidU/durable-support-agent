import { OrchestrationContext, OrchestrationHandler } from 'durable-functions';

interface OrchestrationInput {
  caseId: string;
  action: 'refund' | 'escalation';
}

const APPROVAL_TIMEOUT_DAYS = 7;

export const supportCaseOrchestrator: OrchestrationHandler = function* (context: OrchestrationContext) {
  const input = context.df.getInput<OrchestrationInput>();
  const { caseId, action } = input;

  if (!context.df.isReplaying) {
    context.log(`Orchestration started for case: ${caseId} (action: ${action})`);
  }

  // Step 1: Ensure case is marked as pending_approval
  yield context.df.callActivity('updateCase', {
    caseId,
    status: 'pending_approval',
  });

  // Step 2: Wait for approval with a timeout — auto-rejects after APPROVAL_TIMEOUT_DAYS
  const deadline = new Date(context.df.currentUtcDateTime);
  deadline.setDate(deadline.getDate() + APPROVAL_TIMEOUT_DAYS);

  const approvalTask = context.df.waitForExternalEvent('Approval');
  const timeoutTask = context.df.createTimer(deadline);

  const winner = yield context.df.Task.any([approvalTask, timeoutTask]);

  let approved = false;
  if (winner === approvalTask) {
    timeoutTask.cancel();
    approved = (approvalTask.result as { approved: boolean }).approved;
  } else {
    // Timed out — treat as rejected
    if (!context.df.isReplaying) {
      context.log(`Case ${caseId} timed out after ${APPROVAL_TIMEOUT_DAYS} days — auto-rejecting`);
    }
  }

  if (approved) {
    // Step 3a: Approved — update status, process action, notify
    yield context.df.callActivity('updateCase', {
      caseId,
      status: 'approved',
    });

    if (action === 'refund') {
      yield context.df.callActivity('issueRefund', { caseId });
    }

    const resolution = action === 'refund'
      ? 'Refund approved and processed by supervisor'
      : 'Escalation acknowledged by supervisor';

    yield context.df.callActivity('updateCase', {
      caseId,
      status: 'completed',
      resolution,
    });

    const message = action === 'refund'
      ? `Your support case ${caseId} has been approved and processed. The refund will appear on your account within 5-7 business days.`
      : `Your support case ${caseId} has been reviewed and approved. A supervisor will follow up with you shortly.`;

    yield context.df.callActivity('notifyBot', { caseId, message });

    return { caseId, result: 'approved' };
  } else {
    // Step 3b: Rejected (or timed out) — update status, notify
    yield context.df.callActivity('updateCase', {
      caseId,
      status: 'rejected',
      resolution: winner === approvalTask ? 'Rejected by supervisor' : 'Auto-rejected: approval timed out',
    });

    yield context.df.callActivity('notifyBot', {
      caseId,
      message: `Your support case ${caseId} has been reviewed and was not approved. Please contact support for more information.`,
    });

    return { caseId, result: 'rejected' };
  }
};
