#!/usr/bin/env python3
"""Catalog setup after explicit backend approval. Requires existing Supabase CLI login.
No management token, service-role key, or database password is written to source.
"""
import base64
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
META = ROOT / 'catalog/project.json'
ORG = os.environ.get('HARRY_CATALOG_ORG', '')
NAME = 'harrys-word-master-catalog'


def token():
    value = os.environ.get('SUPABASE_ACCESS_TOKEN', '')
    if not value:
        r = subprocess.run(['/usr/bin/security', 'find-generic-password', '-s', 'Supabase CLI', '-a', 'access-token', '-w'], capture_output=True, text=True)
        value = r.stdout.strip() if r.returncode == 0 else ''
        if value.startswith('go-keyring-base64:'):
            value = base64.b64decode(value.split(':', 1)[1]).decode()
    if not value:
        legacy = Path.home() / '.supabase/access-token'
        if legacy.is_file(): value = legacy.read_text().strip()
    if not re.fullmatch(r'sbp_(oauth_)?[a-f0-9]{40}', value): raise RuntimeError('Run supabase login first.')
    return value


def api(path, data=None):
    credential = token()
    config = 'url = ' + json.dumps('https://api.supabase.com/v1' + path) + '\nheader = ' + json.dumps('Authorization: Bearer ' + credential) + '\n'
    if data is not None:
        config += 'header = "Content-Type: application/json"\ndata = ' + json.dumps(json.dumps(data)) + '\n'
    r = subprocess.run(['/usr/bin/curl', '--config', '-', '--silent', '--show-error', '--max-time', '60', '--write-out', '\n%{http_code}'], input=config, capture_output=True, text=True)
    if r.returncode: raise RuntimeError('Network error. Inspect project state before retrying creation.')
    body, code = r.stdout.rsplit('\n', 1)
    if not 200 <= int(code) < 300:
        message = body.replace(credential, '[redacted]')
        if data and 'db_pass' in data: message = message.replace(data['db_pass'], '[redacted]')
        raise RuntimeError('Supabase HTTP ' + code + ': ' + message[:500])
    return json.loads(body) if body.strip() else None


def ref(): return json.loads(META.read_text())['ref']
def query(sql): return api('/projects/' + ref() + '/database/query', {'query': sql})


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if action == 'create':
        if not ORG: raise RuntimeError('Set HARRY_CATALOG_ORG to the approved free organization ID.')
        if api('/organizations/' + ORG).get('plan') != 'free': raise RuntimeError('Expected free organization; creation cancelled.')
        matches = [p for p in api('/projects') if p['name'] == NAME and p.get('organization_id', p.get('organization_slug')) == ORG]
        if len(matches) > 1: raise RuntimeError('Multiple matching projects; resolve before continuing.')
        p = matches[0] if matches else api('/projects', {'name': NAME, 'organization_id': ORG, 'organization_slug': ORG, 'db_pass': secrets.token_urlsafe(36), 'region': 'ap-southeast-1', 'plan': 'free'})
        project_ref = p.get('ref') or p['id']
        META.write_text(json.dumps({'ref': project_ref, 'name': NAME, 'organization': ORG, 'plan_at_creation': 'free'}, indent=2) + '\n')
        print(json.dumps({'ref': project_ref, 'status': p.get('status'), 'plan': 'free'}))
    elif action == 'status':
        p = api('/projects/' + ref())
        print(json.dumps({k: p.get(k) for k in ['id', 'ref', 'name', 'status']}))
    elif action == 'configure':
        keys = api('/projects/' + ref() + '/api-keys')
        anon = next(k['api_key'] for k in keys if k['name'] == 'anon')
        claims = json.loads(base64.urlsafe_b64decode(anon.split('.')[1] + '==='))
        if claims.get('role') != 'anon': raise RuntimeError('Refusing to expose a privileged key.')
        config = {'url': 'https://' + ref() + '.supabase.co', 'anonKey': anon}
        (ROOT / 'dist/catalog-config.js').write_text('// Public browser key; database policies enforce permissions.\nexport const catalogConfig = ' + json.dumps(config, indent=2) + ';\n')
        print('Browser-safe configuration written.')
    elif action == 'migrate':
        for migration in sorted((ROOT / 'catalog/migrations').glob('*.sql')):
            exists = query("select to_regclass('public.catalog_migrations') as name")
            if exists[0]['name'] and query("select version from public.catalog_migrations where version='" + migration.stem + "'"):
                print(migration.stem + ': already applied'); continue
            query(migration.read_text()); print(migration.stem + ': applied')
    elif action == 'query':
        print(json.dumps(query(sys.stdin.read()), ensure_ascii=False))
    else: raise RuntimeError('Unknown action.')


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error), file=sys.stderr); sys.exit(1)
