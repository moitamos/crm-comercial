/**
 * Tipos iniciais do domínio CRM.
 * Serão alinhados com as tabelas PostgreSQL na próxima etapa.
 */
export type PipelineStage =
  | "por_contactar"
  | "em_negociacao"
  | "agendado"
  | "contactar_futuramente"
  | "venda"
  | "perdido";

export type ServicePackage = "M5" | "M4" | "M3" | "M2" | "M_MOVEL" | "GCP";

export interface Customer {
  id: string;
  nif: string;
  name: string;
  portfolioId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerService {
  id: string;
  customerId: string;
  serviceNumber: string;
  package: ServicePackage;
  fidelityEndDate: string | null;
  importedAt: string;
}

export interface Opportunity {
  id: string;
  customerId: string;
  serviceIds: string[];
  stage: PipelineStage;
  contactDate: string | null;
  lossReason: string | null;
  createdAt: string;
  updatedAt: string;
}
