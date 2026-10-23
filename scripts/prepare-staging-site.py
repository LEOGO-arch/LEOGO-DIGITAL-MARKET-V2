"""Copy a committed frontend into the existing restricted staging Site only."""
import argparse,json,re,shutil,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--site-root',required=True);a=p.parse_args()
root=Path(a.site_root).resolve();manifest=json.loads((root/'.openai/hosting.json').read_text())
assert manifest['project_id']=='appgprj_6ac25de0b33c81919012f2249680abae','Wrong Site'
old_auth=(root/'dist/js/auth.js').read_text()
key=re.search(r"PUBLISHABLE_KEY\s*=\s*'([^']+)'",old_auth)[1]
assert key.startswith('sb_publishable_') and 'uxikemfrzqatsbqutida.supabase.co' in old_auth
repo=Path(__file__).resolve().parents[1]
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
paths=subprocess.check_output(['git','ls-tree','-r','--name-only',sha],cwd=repo,text=True).splitlines()
allowed={'admin','partner','staff','pickup','assets','css','js'}
files=[x for x in paths if x=='index.html' or x.split('/')[0] in allowed]
dest=root/'dist';shutil.rmtree(dest);dest.mkdir()
for name in files:
 content=subprocess.check_output(['git','show',sha+':'+name],cwd=repo)
 if Path(name).suffix in {'.js','.html','.css','.json','.svg'}:
  text=content.decode()
  text=text.replace('https://dzdciuqkqixwutvtfotj.supabase.co','https://uxikemfrzqatsbqutida.supabase.co')
  text=text.replace('sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF',key)
  text=text.replace('https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2','https://leogo-phase1-staging.vincentozzomondi1997.chatgpt.site')
  assert 'dzdciuqkqixwutvtfotj' not in text and not re.search(r'sb_secret_[A-Za-z0-9_-]{20,}',text),'Unexpected production/secret reference: '+name
  if Path(name).suffix=='.html':
   text=re.sub(r'(<body\b[^>]*>)',r'\1<div role="status" style="background:#ffe4a3;color:#251900;padding:8px;text-align:center;font:600 14px sans-serif">STAGING — ARTIFICIAL TEST DATA — NO REAL PAYMENTS</div>',text,count=1,flags=re.I)
  content=text.encode()
 target=dest/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
(dest/'STAGING_SOURCE.json').write_text(json.dumps({'repository':'LEOGO-arch/LEOGO-DIGITAL-MARKET-V2','commit':sha,'supabase_project':'uxikemfrzqatsbqutida'},indent=2)+'\n')
print(json.dumps({'source_commit':sha,'frontend_files':len(files),'backend':'uxikemfrzqatsbqutida'}))
