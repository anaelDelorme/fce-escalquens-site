// Application limits stay below CheckoutPayer's documented 255-character limits.
export const contactLimits = { first_name:80, last_name:80, email:254, phone:30 };
const contactFieldLabels = { first_name:'Le prénom', last_name:'Le nom', email:'L’adresse e-mail', phone:'Le téléphone' };
const invisible = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;
export function contactIssue(field, value) {
  if(!Object.hasOwn(contactLimits,field))return '';
  const label=contactFieldLabels[field];
  if(typeof value!=='string'||!value.trim())return `${label} est obligatoire.`;
  if(value.length>contactLimits[field])return `${label} est limité à ${contactLimits[field]} caractères.`;
  if(invisible.test(value))return `${label} contient un caractère invisible ou un retour à la ligne. Retapez ce champ.`;
  const text=value.trim();
  if(field==='first_name'||field==='last_name'){
    if(/[()[\]{}（）［］｛｝]|\p{N}/u.test(text))return `${label} doit être saisi sans parenthèses, chiffres ni précision comme « coach U10 ». Utilisez les champs Club ou Équipe pour ces mentions.`;
    if(!/\p{L}/u.test(text))return `${label} doit contenir au moins une lettre.`;
    if(text.includes('@')||text.includes('://'))return `${label} doit contenir votre identité, pas une adresse e-mail ou un lien.`;
  }
  if(field==='email'){
    const parts=text.split('@'),local=parts[0],domain=parts[1];
    if(parts.length!==2||!local||local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..')||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)||!domain||domain.length>253||
      domain.split('.').length<2||domain.split('.').some(part=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)))
      return 'Vérifiez l’adresse e-mail : par exemple prenom.nom@exemple.fr, sans espace.';
  }
  if(field==='phone'){
    const digits=text.replace(/\D/g,'');
    if(!/^\+?[0-9 ().\-\u00a0\u202f]+$/.test(text)||digits.length<6||digits.length>15)
      return 'Vérifiez le téléphone : 6 à 15 chiffres, avec éventuellement + au début et des espaces, points ou tirets.';
  }
  return '';
}

export function bindContactValidation(form, fields=Object.keys(contactLimits)) {
  form.noValidate=true;
  const inputs=fields.map(name=>form.elements.namedItem(name)).filter(Boolean);
  const validate=input=>{
    const issue=contactIssue(input.name,input.value),output=input.parentElement.querySelector('[data-contact-error]');
    input.setCustomValidity(issue);input.setAttribute('aria-invalid',String(!!issue));
    output.textContent=issue;output.hidden=!issue;
    return !issue;
  };
  for(const input of inputs){
    const output=document.createElement('small');output.dataset.contactError='';output.hidden=true;output.className='commerce-field-error';
    output.id=`${form.id||'contact'}-${input.name}-error`;output.setAttribute('aria-live','polite');input.parentElement.append(output);
    input.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),output.id].filter(Boolean).join(' '));
    input.addEventListener('input',()=>validate(input));input.addEventListener('blur',()=>validate(input));
  }
  return ()=>{
    let first;
    for(const input of inputs)if(!validate(input)&&!first)first=input;
    if(first){first.focus();first.reportValidity();return false;}
    return true;
  };
}
