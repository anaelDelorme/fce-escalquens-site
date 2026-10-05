"""Alert on EVERY failed workflow, including checkout/runtime/collector failures."""
import json
import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

required = ['SYNC_SMTP_HOST', 'SYNC_SMTP_USER', 'SYNC_SMTP_PASSWORD', 'SYNC_MAIL_FROM', 'SYNC_MAIL_TO']
missing = [key for key in required if not os.environ.get(key)]
if missing:
    raise SystemExit('Configuration mail manquante : ' + ', '.join(missing))
url = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
result_path = Path('sync-reports/result.json')
result = json.loads(result_path.read_text()) if result_path.exists() else {'error': 'Workflow interrompu avant le bilan du collecteur.'}
message = EmailMessage()
message['From'] = os.environ['SYNC_MAIL_FROM']
message['To'] = os.environ['SYNC_MAIL_TO']
message['Subject'] = f"[FCE] Échec synchronisation — {os.environ.get('SYNC_ENV', 'production')} — {os.environ['GITHUB_RUN_ID']}"
message.set_content(f"La synchronisation FFF a échoué.\n\nExécution : {url}\n\n" + json.dumps(result, ensure_ascii=False, indent=2))
port = int(os.environ.get('SYNC_SMTP_PORT', '587'))
recipients = [value.strip() for value in os.environ['SYNC_MAIL_TO'].split(',') if value.strip()]
context = ssl.create_default_context()
client = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
options = {'context': context} if port == 465 else {}
with client(os.environ['SYNC_SMTP_HOST'], port, timeout=30, **options) as smtp:
    if port != 465:
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
    smtp.login(os.environ['SYNC_SMTP_USER'], os.environ['SYNC_SMTP_PASSWORD'])
    refused = smtp.send_message(message, to_addrs=recipients)
    if refused:
        raise SystemExit('Certains destinataires ont été refusés par le serveur SMTP.')
print('Alerte acceptée par le serveur SMTP.')
