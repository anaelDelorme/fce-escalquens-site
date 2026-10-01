#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()
changed=[]

def read(path):
    p=ROOT/path
    if not p.exists():
        raise SystemExit(f"Fichier introuvable : {path}")
    return p.read_text(encoding="utf-8")

def write(path,content):
    (ROOT/path).write_text(content,encoding="utf-8")
    changed.append(path)

# --- public/team-profile.js ---
path="public/team-profile.js"
content=read(path)

content=content.replace(
    "const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};",
    "const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Parents aidants'};",
    1
)

marker="const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Parents aidants'};"
if "const staffInitials=value=>" not in content:
    content=content.replace(
        marker,
        marker + """
const staffInitials=value=>String(value||'')
  .trim()
  .split(/\\s+/)
  .filter(Boolean)
  .slice(0,2)
  .map(part=>part[0]?.toUpperCase()||'')
  .join('');""",
        1
    )

old="""  staffNode.innerHTML=sortedStaff.map(item=>`<article class="${item.role==='coach_referent'?'is-referent':''}">${item.member.photo_key?`<img src="/media/${esc(item.member.photo_key)}" alt="">`:''}<small>${roleLabels[item.role]||esc(item.role)}</small><h3>${esc(item.member.full_name)}</h3>${item.member.email?`<a href="mailto:${esc(item.member.email)}">${esc(item.member.email)}</a>`:''}${item.member.phone?`<a href="tel:${esc(item.member.phone)}">${esc(item.member.phone)}</a>`:''}</article>`).join('')||'<p>Encadrement à venir.</p>';
"""
new="""  staffNode.innerHTML=sortedStaff.map(item=>{
    const member=item.member||{};
    const hasPhoto=Boolean(member.photo_key);
    const hasContact=Boolean(member.email||member.phone);
    const compact=!hasPhoto&&!hasContact;
    const classes=[
      item.role==='coach_referent'?'is-referent':'',
      compact?'is-compact':''
    ].filter(Boolean).join(' ');
    const avatar=hasPhoto
      ?`<img src="/media/${esc(member.photo_key)}" alt="">`
      :`<span class="staff-avatar" aria-hidden="true">${esc(staffInitials(member.full_name)||'FCE')}</span>`;
    return `<article class="${classes}">
      ${avatar}
      <div class="staff-copy">
        <small>${roleLabels[item.role]||esc(item.role)}</small>
        <h3>${esc(member.full_name)}</h3>
        ${member.email?`<a href="mailto:${esc(member.email)}">${esc(member.email)}</a>`:''}
        ${member.phone?`<a href="tel:${esc(member.phone)}">${esc(member.phone)}</a>`:''}
      </div>
    </article>`;
  }).join('')||'<p>Encadrement à venir.</p>';
"""
if old not in content and new not in content:
    raise SystemExit("Rendu staff attendu introuvable dans public/team-profile.js")
if old in content:
    content=content.replace(old,new,1)

write(path,content)

# --- public/admin-team-staff.js ---
path="public/admin-team-staff.js"
content=read(path)
content=content.replace(
    "const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};",
    "const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Parents aidants'};",
    1
)
write(path,content)

# --- public/admin.js ---
path="public/admin.js"
content=read(path)
content=content.replace(
    "['arbitre','Arbitre']",
    "['arbitre','Parents aidants']"
)
write(path,content)

# --- fiche équipe CSS ---
path="src/pages/equipes/fiche.astro"
content=read(path)

old_css=""".staff article.is-referent{border-top:6px solid var(--gold);background:#fffaf0;box-shadow:0 8px 24px #55101812}.staff article.is-referent small{display:inline-flex;width:max-content;padding:5px 8px;background:var(--wine);color:#fff}.staff article h3{margin:2px 0}.staff article img{width:72px;height:72px;object-fit:cover;border-radius:50%;margin-bottom:10px}
"""
new_css=""".staff{align-items:start}.staff article{align-self:start}.staff article.is-referent{border-top:6px solid var(--gold);background:#fffaf0;box-shadow:0 8px 24px #55101812}.staff article.is-referent small{display:inline-flex;width:max-content;padding:5px 8px;background:var(--wine);color:#fff}.staff article h3{margin:2px 0}.staff article img,.staff-avatar{width:72px;height:72px;border-radius:50%;margin-bottom:10px}.staff article img{object-fit:cover}.staff-avatar{display:grid;place-items:center;background:#f2e8e2;color:var(--wine);font-size:20px;font-weight:950}.staff-copy{display:grid;gap:8px}.staff article.is-compact{grid-template-columns:52px 1fr;align-items:center;gap:14px;padding:20px 24px}.staff article.is-compact .staff-avatar{width:52px;height:52px;margin:0;font-size:16px}.staff article.is-compact .staff-copy{gap:4px}.staff article.is-compact h3{margin:0}@media(max-width:600px){.staff article.is-compact{grid-template-columns:46px 1fr;padding:18px}.staff article.is-compact .staff-avatar{width:46px;height:46px}}
"""
if new_css not in content:
    if old_css not in content:
        raise SystemExit("CSS staff attendu introuvable dans fiche.astro")
    content=content.replace(old_css,new_css,1)

content=content.replace('/team-profile.js?v=30','/team-profile.js?v=31')
write(path,content)

print("Correctif encadrement appliqué :")
for item in changed:
    print(" -",item)
print("\\nTri conservé : coach référent d'abord, puis ordre alphabétique.")
