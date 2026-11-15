"""Generate smaller copies of eligible public images; never change originals."""
import hashlib, io, json, pathlib, re, sys, urllib.request
from PIL import Image, ImageOps
BASE = "https://dzdciuqkqixwutvtfotj.supabase.co/storage/v1/object/public/"
BUCKETS = {"seller-product-media", "service-provider-public-media", "cyber-public-media", "accommodation-public-media", "transport-public-media", "vacant-house-public-media", "category-public-media"}
Image.MAX_IMAGE_PIXELS = 40_000_000
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
OPENER = urllib.request.build_opener(NoRedirect())
def valid(bucket, path):
    return bucket in BUCKETS and isinstance(path, str) and len(path) <= 600 and all(re.fullmatch(r"[A-Za-z0-9_. -]+", p) and p not in (".", "..") for p in path.split("/")) and re.search(r"\.(jpg|jpeg|png|webp|avif|gif)$", path, re.I)
def variants(data):
    with Image.open(io.BytesIO(data)) as raw:
        if raw.width * raw.height > Image.MAX_IMAGE_PIXELS or getattr(raw, 'is_animated', False): return {}
        image = ImageOps.exif_transpose(raw).convert("RGBA" if "A" in raw.getbands() or "transparency" in raw.info else "RGB")
        result = {}
        for kind, size, quality, target in (("thumb",360,76,55*1024),("full",1280,82,250*1024)):
            im = image.copy()
            im.thumbnail((size,size), Image.Resampling.LANCZOS)
            for _ in range(5):
                out = io.BytesIO()
                im.save(out, format="WEBP", quality=quality, method=4)
                value = out.getvalue()
                if len(value) <= target: break
                quality = max(58,quality-7)
                im.thumbnail((max(1,int(im.width*.82)),max(1,int(im.height*.82))), Image.Resampling.LANCZOS)
            if len(value) < len(data): result[kind] = value
        return result
def main():
    from urllib.parse import quote
    target, previous = map(pathlib.Path, sys.argv[1:3])
    output = target / "seo-catalogue" / "optimized-media"
    output.mkdir(parents=True, exist_ok=True)
    old = {}
    try: old = json.loads((previous / "optimized-media" / "manifest.json").read_text())
    except (OSError, ValueError): pass
    rows = json.load(sys.stdin)
    if not isinstance(rows,list): raise ValueError("Invalid image inventory")
    manifest, failed, reused, processed = {},0,0,0
    for row in rows:
        bucket,path = row.get("bucket"),row.get("path")
        if not valid(bucket,path) or (bucket=="seller-product-media" and path.endswith("-opt.webp")) or path.endswith("-thumb.webp"): continue
        url=BASE+bucket+"/"+"/".join(quote(p,safe="") for p in path.split("/"))
        if url in manifest: continue
        digest=hashlib.sha256(url.encode()).hexdigest()
        cached=old.get(url)
        if isinstance(cached,dict) and all(k in ("thumb","full") and v=="/seo-catalogue/optimized-media/"+digest+"-"+k+".webp" and (previous/"optimized-media"/pathlib.Path(v).name).is_file() for k,v in cached.items()):
            for v in cached.values(): (output/pathlib.Path(v).name).write_bytes((previous/"optimized-media"/pathlib.Path(v).name).read_bytes())
            manifest[url]=cached; reused+=1; continue
        try:
            with OPENER.open(url, timeout=15) as response:
                if response.geturl()!=url: raise ValueError("Unexpected redirect")
                data=response.read(10*1024*1024+1)
            if len(data)>10*1024*1024: raise ValueError("Image exceeds limit")
            entry={}
            for kind,value in variants(data).items():
                name=digest+"-"+kind+".webp"
                (output/name).write_bytes(value)
                entry[kind]="/seo-catalogue/optimized-media/"+name
            manifest[url]=entry; processed+=1
        except Exception as error:
            failed+=1
            print("Public image optimization skipped:",type(error).__name__,file=sys.stderr)
    (output/"manifest.json").write_text(json.dumps(manifest,sort_keys=True,separators=(",",":"))+"\n")
    print(f"Public image optimization: {processed} processed, {reused} reused, {failed} skipped; originals retained.")
if __name__=="__main__": main()
