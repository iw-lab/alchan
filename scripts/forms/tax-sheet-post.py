# 줄 높이(손글씨 칸)·남은 예시 글자 정리 — rhwp 로 만든 HWPX 의 표 XML 을 다듬는다
import re, sys, zipfile, shutil
src, out = sys.argv[1], sys.argv[2]
HEAD, ROW = 1700, 1780  # 머리행 6mm · 학생 줄 6.3mm (HWPUNIT, 1mm≈283.5) — 한 쪽(가로 A4)에 25줄
zin = zipfile.ZipFile(src)
files = {n: zin.read(n) for n in zin.namelist()}
s = files['Contents/section0.xml'].decode('utf-8')
assert s.count('가나다라마바') == 1; s = s.replace('가나다라마바', '')
def fix_tc(m):
    tc = m.group(0)
    r = int(re.search(r'rowAddr="(\d+)"', tc).group(1)); rs = int(re.search(r'rowSpan="(\d+)"', tc).group(1))
    h = sum(HEAD if rr < 2 else ROW for rr in range(r, r + rs))
    return re.sub(r'(<hp:cellSz width="\d+" height=")\d+(")', lambda x: x.group(1) + str(h) + x.group(2), tc)
s, n = re.subn(r'<hp:tc .*?</hp:tc>', fix_tc, s, flags=re.S)
total = 2 * HEAD + 25 * ROW
s = re.sub(r'(<hp:tbl [^>]*rowCnt="27"[^>]*><hp:sz width="\d+" widthRelTo="ABSOLUTE" height=")\d+(")', lambda x: x.group(1) + str(total) + x.group(2), s)
files['Contents/section0.xml'] = s.encode('utf-8')
# 표 선 0.12mm → 0.4mm: 인쇄해 찍은 사진에서도 칸 선이 또렷해야 앱이 이름 칸을 찾는다(얇으면 선이 빠져 «못 찾음»)
hx = files['Contents/header.xml'].decode('utf-8')
bf = re.search(r'<hh:borderFill id="3".*?</hh:borderFill>', hx, re.S).group(0)
hx = hx.replace(bf, re.sub(r'(Border type="SOLID" width=")0\.12 mm', r'\g<1>0.4 mm', bf))
assert '0.4 mm' in hx
files['Contents/header.xml'] = hx.encode('utf-8')
with zipfile.ZipFile(out, 'w') as z:
    z.writestr(zipfile.ZipInfo('mimetype'), files.pop('mimetype'), compress_type=zipfile.ZIP_STORED)
    for k, v in files.items(): z.writestr(k, v, compress_type=zipfile.ZIP_DEFLATED)
print('cells', n, 'table height mm', round(total / 283.46, 1))
