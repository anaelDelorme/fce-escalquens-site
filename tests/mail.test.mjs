import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('SMTP alert uses TLS, credentials, recipients and run link on every invocation; refusal fails',()=>{
 const script=fileURLToPath(new URL('../scripts/send-sync-failure.py',import.meta.url));
 execFileSync('python3',['-c',`
import os,runpy
from unittest.mock import patch,MagicMock
os.environ.update(SYNC_SMTP_HOST='smtp.example.test',SYNC_SMTP_PORT='587',SYNC_SMTP_USER='user',SYNC_SMTP_PASSWORD='password',SYNC_MAIL_FROM='from@example.test',SYNC_MAIL_TO='one@example.test,two@example.test',GITHUB_REPOSITORY='owner/repo',GITHUB_RUN_ID='42')
for port in ('587','465'):
 os.environ['SYNC_SMTP_PORT']=port
 for invocation in range(2):
  server=MagicMock();smtp=MagicMock();server.return_value.__enter__.return_value=smtp;smtp.send_message.return_value={}
  with patch('smtplib.SMTP',server),patch('smtplib.SMTP_SSL',server):runpy.run_path(${JSON.stringify(script)})
  assert smtp.send_message.call_count==1
  message=smtp.send_message.call_args.args[0]
  assert 'https://github.com/owner/repo/actions/runs/42' in message.get_content()
  assert smtp.send_message.call_args.kwargs['to_addrs']==['one@example.test','two@example.test']
  assert smtp.starttls.call_count==(1 if port=='587' else 0)
  smtp.login.assert_called_once_with('user','password')
server=MagicMock();smtp=server.return_value.__enter__.return_value;smtp.send_message.return_value={'one@example.test':'refused'}
with patch('smtplib.SMTP_SSL',server):
 try:runpy.run_path(${JSON.stringify(script)})
 except SystemExit:pass
 else:raise AssertionError('SMTP refusal must fail')
`],{stdio:'pipe'});
});
