export interface SupportCase {
  id: string;
  conversationId: string;
  userId: string;
  userName: string;
  orderId: string;
  customerEmail: string;
  issueDescription: string;
  action: 'refund' | 'escalation';
  refundAmount?: number;
  status: 'pending_approval' | 'approved' | 'rejected' | 'completed';
  orchestrationId: string;
  createdAt: string;
  updatedAt: string;
  resolution?: string;
}
