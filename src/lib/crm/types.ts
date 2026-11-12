export type DealActivityStateItem = {
  id: string;
  deal_id: string;
  commercial_id: string;
  event_type: string;
  description: string | null;
  event_data: Record<string, unknown> | null;
  occurred_at: string;
};

export type DealSnapshotState = {
  stage: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  lost_reason: string | null;
};

export type FormActionState = {
  error?: string;
  success?: string;
  activities?: DealActivityStateItem[];
  removedActivityIds?: string[];
  dealSnapshot?: DealSnapshotState;
};
