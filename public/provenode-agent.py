#!/usr/bin/env python3
"""Provenode zero-cost edge agent: resumable download, SHA-256 verification, atomic activation."""
import argparse, hashlib, json, os, pathlib, shutil, sys, urllib.request
CHUNK=1024*1024

def download(url, partial):
    start=partial.stat().st_size if partial.exists() else 0
    req=urllib.request.Request(url,headers={'Range':f'bytes={start}-'} if start else {})
    mode='ab' if start else 'wb'
    with urllib.request.urlopen(req,timeout=30) as r, partial.open(mode) as f:
        while True:
            block=r.read(CHUNK)
            if not block: break
            f.write(block); print(f'\rDownloaded {f.tell()/1048576:.1f} MB',end='',flush=True)
    print()

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(CHUNK),b''): h.update(block)
    return h.hexdigest()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('manifest');ap.add_argument('--dir',default='./models');a=ap.parse_args()
    m=json.load(urllib.request.urlopen(a.manifest)) if a.manifest.startswith('http') else json.load(open(a.manifest))
    root=pathlib.Path(a.dir);root.mkdir(parents=True,exist_ok=True)
    partial=root/(m['model']+'.partial'); target=root/(m['model']+'-'+m['version']+'.bin'); current=root/'current-model'
    download(m.get('downloadUrl') or m.get('shelbyUrl'),partial)
    actual=digest(partial); expected=m['sha256'].lower()
    if actual!=expected:
        partial.unlink(missing_ok=True);sys.exit(f'REJECTED: SHA-256 mismatch\nexpected {expected}\nactual   {actual}')
    os.replace(partial,target)
    tmp=root/'current-model.next';tmp.unlink(missing_ok=True);tmp.symlink_to(target.name);os.replace(tmp,current)
    print(f'VERIFIED and activated: {target}\nShelby object: {m.get("shelbyObjectId","unknown")}')
if __name__=='__main__':main()
