export const SYSTEM_CONFIG = {
  SERVICE_PHONE: '19050277657',
  COPYRIGHT_YEAR: '2026'
} as const;

export type SystemConfig = typeof SYSTEM_CONFIG;

export function formatServicePhone(phone: string = SYSTEM_CONFIG.SERVICE_PHONE): string {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
