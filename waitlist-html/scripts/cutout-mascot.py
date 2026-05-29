from PIL import Image
import collections
import os
import sys

def flood_cutout(src, dst, tol=30):
    img = Image.open(src).convert('RGBA')
    w, h = img.size
    px = img.load()
    seen = set()
    q = collections.deque()

    def near_white(x, y):
        r, g, b, a = px[x, y]
        return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol

    for x in range(w):
        for y in (0, h - 1):
            if near_white(x, y):
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near_white(x, y):
                q.append((x, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        if (x, y) in seen:
            continue
        if not near_white(x, y):
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    img.save(dst, 'PNG')
    print('saved', dst, img.size)

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    repo = os.path.dirname(root)
    out = os.path.join(root, 'assets', 'images')
    pairs = [
        (os.path.join(repo, '玩偶1.png'), os.path.join(out, 'welcome-mascot-1-cutout.png')),
        (os.path.join(repo, '玩偶2.png'), os.path.join(out, 'welcome-mascot-2-cutout.png')),
    ]
    for src, dst in pairs:
        flood_cutout(src, dst)
