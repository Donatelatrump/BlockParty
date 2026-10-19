"""Extract bitmap-backed character timelines and MP3 sounds from local SWFs.
Run from the workspace root. Uses only the Python standard library.
JPEG pixels remain original; alpha becomes a PNG mask for the browser.
"""
from pathlib import Path
import zlib, json, struct, binascii
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'content/www.funkypotato.com/gamez/nick-block-party/assets'
OUT=ROOT/'nickparty/public/assets'
TEMP=ROOT/'nickparty/.asset-extraction'
def body(path):
 b=path.read_bytes()
 return zlib.decompress(b[8:]) if b[:3]==b'CWS' else b[8:]
def tags(b, pos):
 while pos+2<=len(b):
  h=int.from_bytes(b[pos:pos+2],'little');pos+=2;c=h>>6;n=h&63
  if n==63:n=int.from_bytes(b[pos:pos+4],'little');pos+=4
  d=b[pos:pos+n];pos+=n
  yield c,d
  if c==0:return
def header(b):return (5+4*(b[0]>>3)+7)//8+4
def rect(d):
 bits=''.join(f'{v:08b}' for v in d);n=int(bits[:5],2);values=[]
 for i in range(4):
  value=int(bits[5+n*i:5+n*(i+1)],2)
  if value&(1<<(n-1)):value-=1<<n
  values.append(value/20)
 return values
manifest={};jobs=[]
for name in ['bob','mikey','sam','cat','fanboy','skipper','sheen','tori']:
 b=body(SOURCE/'characters'/f'{name}.swf');alltags=list(tags(b,header(b)));images={};shapes={};states={}
 for c,d in alltags:
  if c==35:
   id=int.from_bytes(d[:2],'little');offset=int.from_bytes(d[2:6],'little');jpeg=d[6:6+offset]
   if jpeg[:4]==b'\xff\xd9\xff\xd8':jpeg=jpeg[2:]
   alpha=zlib.decompress(d[6+offset:]);folder=TEMP/name;folder.mkdir(parents=True,exist_ok=True)
   (folder/f'{id}.jpg').write_bytes(jpeg);(folder/f'{id}.alpha').write_bytes(alpha);images[id]=True
 for c,d in alltags:
  if c in (2,22,32,83):
   id=int.from_bytes(d[:2],'little')
   refs=[i for i in images if any(bytes([f])+struct.pack('<H',i) in d[2:] for f in (0x40,0x41,0x42,0x43))]
   if refs:shapes[id]=(refs[0],rect(d[2:]))
 # Main character timeline has the original directional state labels.
 for c,d in alltags:
  if c!=39 or b'idlingSE\x00' not in d:continue
  state=None;current=None
  for t,v in tags(d,4):
   if t==43:state=v.rstrip(b'\x00').decode();states[state]=[]
   elif t==26 and len(v)>=5 and v[0]&2:
    char=int.from_bytes(v[3:5],'little')
    if char in shapes:current=char
   elif t==1 and state and current:states[state].append(current)
 if 'loose' in states:states['looseFront']=states.pop('loose')
 if not states:raise ValueError(f'No character timeline: {name}')
 used={shape for frames in states.values() for shape in frames}
 for shape in used:
  image,bounds=shapes[shape];jobs.append({'name':name,'id':shape,'image':image,'bounds':bounds})
 manifest[name]={key:[{'file':f'{name}/{shape}.png','bounds':shapes[shape][1]} for shape in frames] for key,frames in states.items()}
def jpeg_size(data):
 pos=2
 while pos<len(data):
  if data[pos]!=255:pos+=1;continue
  marker=data[pos+1];pos+=2
  if marker in (0xd8,0xd9):continue
  size=int.from_bytes(data[pos:pos+2],'big')
  if marker in (0xc0,0xc1,0xc2):return int.from_bytes(data[pos+5:pos+7],'big'),int.from_bytes(data[pos+3:pos+5],'big')
  pos+=size
 raise ValueError('JPEG dimensions missing')
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',binascii.crc32(kind+data)&0xffffffff)
for job in jobs:
 folder=OUT/'sprites'/job['name'];folder.mkdir(parents=True,exist_ok=True)
 source=TEMP/job['name']/str(job['image']);jpeg=source.with_suffix('.jpg').read_bytes();alpha=source.with_suffix('.alpha').read_bytes();w,h=jpeg_size(jpeg)
 if len(alpha)!=w*h:raise ValueError('Invalid JPEG3 alpha')
 rgba=bytearray()
 for y in range(h):
  rgba.append(0)
  for x in range(w):rgba.extend((255,255,255,alpha[y*w+x]))
 png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(rgba)))+chunk(b'IEND',b'')
 (folder/f"{job['id']}.jpg").write_bytes(jpeg);(folder/f"{job['id']}.mask.png").write_bytes(png)
for states in manifest.values():
 for frames in states.values():
  for frame in frames:frame['file']=frame['file'].replace('.png','.jpg')
(ROOT/'nickparty/shared/original-character-sprites.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
# DefineSound tag: retain original MP3 payload, omitting SWF seek samples.
audio={}
for path in (SOURCE/'audio/music/boards').glob('*.swf'):
 b=body(path)
 for c,d in tags(b,header(b)):
  if c==14 and d[2]>>4==2:
   target=OUT/'audio'/f'{path.stem}.mp3';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(d[9:]);audio[path.stem]=target.name;break
print(f'{len(jobs)} transparent character frames; {len(audio)} original music tracks')
