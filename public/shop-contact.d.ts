export type ContactField = 'first_name' | 'last_name' | 'email' | 'phone';
export const contactLimits: Record<ContactField,number>;
export function contactIssue(field: ContactField, value: unknown): string;
