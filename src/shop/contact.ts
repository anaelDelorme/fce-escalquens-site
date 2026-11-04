import {contactIssue,type ContactField} from '../../public/shop-contact.js';
import {fail,type Row} from './domain';

export function contactField(field: ContactField, value: unknown): string {
  const issue=contactIssue(field,value);
  if(issue)fail('CONTACT_'+field.toUpperCase(),400,issue);
  const text=(value as string).trim();
  return field==='email'?text.toLowerCase():text;
}
export function payerContact(data: Row) {
  return {
    first_name:contactField('first_name',data.first_name),
    last_name:contactField('last_name',data.last_name),
    email:contactField('email',data.email),
    phone:contactField('phone',data.phone),
  };
}
