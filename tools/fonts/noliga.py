# Hands of Fate — tools/fonts/noliga.py (decision 134)
# Usage: python3 tools/fonts/noliga.py <in.ttf> <out.ttf>. Browsers (and so Cocos TTF labels) apply 'liga' by
# default, which joined "fi" and "fl" in Pixelify Sans and VT323 ("Hands Ared"). This empties liga/clig/dlig.
import sys
from fontTools.ttLib import TTFont
src, dst = sys.argv[1], sys.argv[2]
f = TTFont(src)
n = 0
for fr in f['GSUB'].table.FeatureList.FeatureRecord:
    if fr.FeatureTag in ('liga', 'clig', 'dlig'):
        fr.Feature.LookupListIndex = []; fr.Feature.LookupCount = 0; n += 1
f.save(dst)
print('emptied', n, 'features ->', dst)
