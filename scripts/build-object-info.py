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
                time.sleep(5 * (attempt + 1))
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


def main():
    targets = json.loads((ROOT / 'data/targets.json').read_text())
    ids = [t['id'] for t in targets['solarSystem'] + targets['deepSky']]
    out_path = ROOT / 'data/objects.json'
    previous = json.loads(out_path.read_text())['objects'] if out_path.exists() else {}
    objects = {}
    for oid in ids:
        title, constellation, distance = INFO[oid]
        try:
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
            if src:
                fname = urllib.parse.unquote(src.split('/')[-1])
                if '/thumb/' in src:  # thumb URL: the real file name is the second-last segment
                    fname = urllib.parse.unquote(src.split('/')[-2])
                meta = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
                    'action': 'query', 'titles': 'File:' + fname, 'prop': 'imageinfo',
                    'iiprop': 'url|extmetadata', 'iiurlwidth': 800, 'format': 'json'}))
                page = next(iter(meta['query']['pages'].values()))
                ii = (page.get('imageinfo') or [None])[0]
                if not ii:  # file lives on en.wikipedia (non-free); skip the image
                    raise LookupError('image not on Commons')
                em = ii.get('extmetadata', {})
                lic = strip(em.get('LicenseShortName', {}).get('value'))
                artist = strip(em.get('Artist', {}).get('value')) or strip(em.get('Credit', {}).get('value'))
                img = Image.open(io.BytesIO(get(ii.get('thumburl') or ii['url'], binary=True))).convert('RGB')
                img.thumbnail((640, 640))
                img.save(ROOT / f'assets/img/{oid}.jpg', 'JPEG', quality=78, optimize=True, progressive=True)
                entry['image'] = f'assets/img/{oid}.jpg'
                entry['imageCredit'] = f"{(artist[:80] or 'Unknown author')} · {lic or 'see source'}"
                entry['imageSource'] = ii.get('descriptionurl')
            objects[oid] = entry
            print(f'✓ {oid}: {entry["title"]}{" + image" if "image" in entry else ""}')
        except Exception as e:  # keep the last good entry rather than losing it
            print(f'✗ {oid}: {e}', file=sys.stderr)
            if oid in previous:
                objects[oid] = previous[oid]
            elif 'entry' in dir() and entry.get('title') == title:
                objects[oid] = entry
        time.sleep(1.0)
    out_path.write_text(json.dumps({
        'note': 'Generated by scripts/build-object-info.py. Text from Wikipedia (CC BY-SA 4.0); images from Wikimedia Commons with the credits shown.',
        'objects': objects}, indent=1, ensure_ascii=False) + '\n')
    print(f'Wrote {len(objects)} objects.')


if __name__ == '__main__':
    main()
