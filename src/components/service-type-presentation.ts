import { ServiceType } from '../models/service-type.ts'

export const serviceTypePresentation = {
  [ServiceType.REPAIR]: { label: 'Reparación', issueLabel: 'Problema reportado', issueRequired: true },
  [ServiceType.MAINTENANCE]: { label: 'Mantención', issueLabel: 'Observaciones', issueRequired: false },
} as const satisfies Record<ServiceType, { label: string; issueLabel: string; issueRequired: boolean }>
