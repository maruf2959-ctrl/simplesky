#!/usr/bin/env python3
"""Download a photo + short description for every target into the app.

For each object in data/targets.json this fetches the Wikipedia summary (CC BY-SA text)
and its lead image (with author/licence from Wikimedia Commons), resizes the image to
640 px and writes:
  assets/img/<id>.jpg      the photo
  data/objects.json        description, facts, credits, links

The app ships these files, so pictures work offline and in sandboxed hosts.
Run occasionally by hand:  python3 scripts/build-object-info.py
"""
import html, io, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
UA = 'SimpleSky/1.0 (personal stargazing app; https://github.com/maruf2959-ctrl/simplesky)'

# id: (Wikipedia title, constellation, distance)
INFO = {
    'moon': ('Moon', None, '384,400 km'),
    'mercury': ('Mercury (planet)', None, None), 'venus': ('Venus', None, None), 'mars': ('Mars', None, None),
    'jupiter': ('Jupiter', None, None), 'saturn': ('Saturn', None, None), 'uranus': ('Uranus', None, None), 'neptune': ('Neptune', None, None),
    'M42': ('Orion Nebula', 'Orion', '1,340 light years'),
    'M31': ('Andromeda Galaxy', 'Andromeda', '2.5 million light years'),
    'M33': ('Triangulum Galaxy', 'Triangulum', '2.7 million light years'),
    'M51': ('Whirlpool Galaxy', 'Canes Venatici', '23 million light years'),
    'M81': ('Messier 81', 'Ursa Major', '12 million light years'),
    'M82': ('Messier 82', 'Ursa Major', '12 million light years'),
    'M101': ('Pinwheel Galaxy', 'Ursa Major', '21 million light years'),
    'M104': ('Sombrero Galaxy', 'Virgo', '31 million light years'),
    'M63': ('Sunflower Galaxy', 'Canes Venatici', '29 million light years'),
    'M64': ('Black Eye Galaxy', 'Coma Berenices', '17 million light years'),
    'M66': ('Leo Triplet', 'Leo', '35 million light years'),
    'M106': ('Messier 106', 'Canes Venatici', '24 million light years'),
    'M13': ('Messier 13', 'Hercules', '22,000 light years'),
    'M92': ('Messier 92', 'Hercules', '27,000 light years'),
    'M3': ('Messier 3', 'Canes Venatici', '34,000 light years'),
    'M5': ('Messier 5', 'Serpens', '25,000 light years'),
    'M15': ('Messier 15', 'Pegasus', '33,000 light years'),
    'M2': ('Messier 2', 'Aquarius', '37,000 light years'),
    'M22': ('Messier 22', 'Sagittarius', '10,000 light years'),
    'M57': ('Ring Nebula', 'Lyra', '2,600 light years'),
    'M27': ('Dumbbell Nebula', 'Vulpecula', '1,360 light years'),
    'M97': ('Owl Nebula', 'Ursa Major', '2,000 light years'),
    'M76': ('Little Dumbbell Nebula', 'Perseus', '2,500 light years'),
    'NGC6543': ("Cat's Eye Nebula", 'Draco', '3,300 light years'),
    'NGC7662': ('NGC 7662', 'Andromeda', '2,000 light years'),
    'NGC2392': ('Eskimo Nebula', 'Gemini', '4,000 light years'),
    'M1': ('Crab Nebula', 'Taurus', '6,500 light years'),
    'M8': ('Lagoon Nebula', 'Sagittarius', '4,100 light years'),
    'M17': ('Omega Nebula', 'Sagittarius', '5,500 light years'),
    'NGC7000': ('North America Nebula', 'Cygnus', '2,200 light years'),
    'M45': ('Pleiades', 'Taurus', '444 light years'),
    'M44': ('Beehive Cluster', 'Cancer', '577 light years'),
    'NGC869': ('Double Cluster', 'Perseus', '7,500 light years'),
    'M35': ('Messier 35', 'Gemini', '2,800 light years'),
    'M36': ('Messier 36', 'Auriga', '4,100 light years'),
    'M37': ('Messier 37', 'Auriga', '4,500 light years'),
    'M38': ('Messier 38', 'Auriga', '3,500 light years'),
    'M11': ('Wild Duck Cluster', 'Scutum', '6,200 light years'),
    'M52': ('Messier 52', 'Cassiopeia', '5,000 light years'),
    'NGC457': ('NGC 457', 'Cassiopeia', '7,900 light years'),
    'Albireo': ('Albireo', 'Cygnus', '430 light years'),
    'Mizar': ('Mizar and Alcor', 'Ursa Major', '83 light years'),
    'Castor': ('Castor (star)', 'Gemini', '51 light years'),
    'EpsLyr': ('Epsilon Lyrae', 'Lyra', '160 light years'),
    'Almach': ('Gamma Andromedae', 'Andromeda', '350 light years'),
    'Algieba': ('Gamma Leonis', 'Leo', '130 light years'),
    'CorCar': ('Cor Caroli', 'Canes Venatici', '110 light years'),
}


def get(url, binary=False):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(int(e.headers.get('Retry-After') or 0) or 30 * (attempt + 1))
                continue
            raise


def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def short(text, limit=520):
    """First few sentences, up to ~limit characters."""
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    out = ''
    for s in sentences:
        if len(out) + len(s) > limit and out:
            break
        out = (out + ' ' + s).strip()
    return out


def fetch_entry(title, constellation, distance):
    s = get('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_')))
    entry = {
        'title': s['title'],
        'summary': short(s.get('extract', '')),
        'url': s['content_urls']['mobile']['page'],
        'constellation': constellation,
        'distance': distance,
        'textCredit': 'Wikipedia (CC BY-SA 4.0)',
    }
    src = (s.get('originalimage') or s.get('thumbnail') or {}).get('source')
    return entry, src


def fetch_image(oid, src):
    path = urllib.parse.urlparse(src).path  # drops ?utm_... tracking parameters
    parts = path.split('/')
    fname = urllib.parse.unquote(parts[-2] if '/thumb/' in path else parts[-1])
    meta = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'titles': 'File:' + fname, 'prop': 'imageinfo',
        'iiprop': 'url|extmetadata', 'iiurlwidth': 800, 'format': 'json'}))
    page = next(iter(meta['query']['pages'].values()))
    ii = (page.get('imageinfo') or [None])[0]
    if not ii:  # file lives on en.wikipedia (non-free); skip it
        raise LookupError(f'{fname} not on Commons')
    em = ii.get('extmetadata', {})
    lic = strip(em.get('LicenseShortName', {}).get('value'))
    artist = strip(em.get('Artist', {}).get('value')) or strip(em.get('Credit', {}).get('value'))
    artist = re.sub(r'\s+', ' ', artist)
    time.sleep(2)
    img = Image.open(io.BytesIO(get(ii.get('thumburl') or ii['url'], binary=True))).convert('RGB')
    img.thumbnail((640, 640))
    img.save(ROOT / f'assets/img/{oid}.jpg', 'JPEG', quality=78, optimize=True, progressive=True)
    return {'image': f'assets/img/{oid}.jpg', 'imageCredit': f"{(artist[:80] or 'Unknown author')} · {lic or 'see source'}", 'imageSource': ii.get('descriptionurl')}


def main():
    """Incremental: only objects missing text or a photo are fetched (pass --all to refresh everything)."""
    refresh_all = '--all' in sys.argv
    targets = json.loads((ROOT / 'data/targets.json').read_text())
    ids = [t['id'] for t in targets['solarSystem'] + targets['deepSky']]
    out_path = ROOT / 'data/objects.json'
    objects = json.loads(out_path.read_text())['objects'] if out_path.exists() else {}
    for oid in ids:
        title, constellation, distance = INFO[oid]
        have = objects.get(oid, {})
        if not refresh_all and have.get('summary') and have.get('image') and (ROOT / have['image']).exists():
            continue
        try:
            entry, src = fetch_entry(title, constellation, distance)
            objects[oid] = {**have, **entry}
            if src:
                time.sleep(2)
                objects[oid].update(fetch_image(oid, src))
            print(f'✓ {oid}: {entry["title"]}{" + image" if "image" in objects[oid] else ""}')
        except Exception as e:  # keep whatever we already had
            print(f'✗ {oid}: {e}', file=sys.stderr)
        out_path.write_text(json.dumps({
            'note': 'Generated by scripts/build-object-info.py. Text from Wikipedia (CC BY-SA 4.0); images from Wikimedia Commons with the credits shown.',
            'objects': objects}, indent=1, ensure_ascii=False) + '\n')
        time.sleep(3)
    print(f'Done: {sum(1 for o in objects.values() if o.get("image"))}/{len(ids)} with photos.')


if __name__ == '__main__':
    main()
