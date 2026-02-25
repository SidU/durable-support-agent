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

export interface Order {
  orderId: string;
  customerEmail: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  status: string;
  orderDate: string;
  deliveryDate: string | null;
}

export interface Customer {
  email: string;
  name: string;
  phone: string;
  memberSince: string;
  tier: 'bronze' | 'silver' | 'gold';
}
