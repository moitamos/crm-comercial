/** Domain types for the CRM. Database constraints and RLS are defined in Supabase migrations. */
export type AppRole = "admin" | "commercial";

export type PipelineStage =
  | "por_contactar"
  | "em_negociacao"
  | "agendado"
  | "contactar_futuramente"
  | "venda"
  | "perdido";

export type ServicePackage = "M5" | "M4" | "M3" | "M2" | "M_MOVEL" | "GCP" | "OUTRO";

export interface Customer {
  id: string;
  nif: string;
  name: string;
  portfolioId: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerService {
  id: string;
  customerId: string;
  nic: string | null;
  ncc: string | null;
  serviceNumber: string | null;
  package: ServicePackage;
  fidelityEndDate: string | null;
  monthlyValue: number | null;
}

export interface Opportunity {
  id: string;
  customerId: string;
  serviceIds: string[];
  stage: PipelineStage;
  nextContactDate: string | null;
  lossReason: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}
