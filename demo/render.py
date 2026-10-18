import json, pathlib, subprocess, textwrap
from PIL import Image, ImageDraw, ImageFont
root=pathlib.Path(__file__).resolve().parents[1]
trace=json.loads((root/'demo/trace.json').read_text())
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
mono='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
def f(s,m=False):return ImageFont.truetype(mono if m else font,s)
W,H=1280,720
proc=subprocess.Popen(['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','12','-i','-','-an','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(root/'demo/slotwise-api-demo.mp4')],stdin=subprocess.PIPE,stderr=subprocess.DEVNULL)
scenes=[{'title':'Good things start with the right time.','intro':True}]+trace['steps']+[{'title':'A clear schedule. A solid backend.','outro':True}]
for idx,scene in enumerate(scenes):
  seconds=4 if idx in [0,len(scenes)-1] else 5
  for frame in range(seconds*12):
    im=Image.new('RGB',(W,H),'#101528');d=ImageDraw.Draw(im)
    d.rounded_rectangle((35,30,1245,690),radius=24,fill='#171e35',outline='#303653',width=1)
    d.text((70,54),'S / SLOTWISE',font=f(19),fill='#c4b5fd')
    d.text((875,58),'NODE.JS 24  /  REAL API DEMO',font=f(12),fill='#929bb7')
    d.line((70,98,1210,98),fill='#303653')
    if scene.get('intro') or scene.get('outro'):
      d.text((80,148),'BOOKING, SIMPLIFIED.',font=f(13),fill='#aa98e7')
      lines=textwrap.wrap(scene['title'],width=32)
      for n,line in enumerate(lines):d.text((80,205+n*65),line,font=f(43),fill='#f3f1ff')
      details=['Session authentication  /  Member & admin access','Database-enforced overlap protection','16 passing integration tests  /  Zero runtime packages']
      if scene.get('intro'):details=['A portfolio project by Fatma ElZahraa Ahmed Saad','Actual captured HTTP requests and responses','Synthetic local data. No browser screen recording.']
      for n,line in enumerate(details):d.text((83,420+n*37),line,font=f(19),fill='#a7adc5')
      d.rounded_rectangle((82,568,360,611),radius=9,fill='#6b52dc');d.text((102,578),'github.com/0fatma5/slotwise',font=f(14),fill='white')
    else:
      d.text((76,124),f'{idx:02d} / {len(trace["steps"]):02d}',font=f(12),fill='#9c8bc7')
      d.text((76,151),scene['title'],font=f(29),fill='#eeeafa')
      d.rounded_rectangle((76,211,1204,616),radius=15,fill='#0d1223',outline='#34394e')
      for n,col in enumerate(['#b66d82','#c3a76a','#72a390']):d.ellipse((98+n*20,231,108+n*20,241),fill=col)
      d.text((178,227),'slotwise / captured HTTP response',font=f(11,True),fill='#69738e')
      method=scene['method'];path=scene['path']
      d.text((99,270),f'> {method} {path}',font=f(19,True),fill='#c0a6fa')
      status=scene['status'];col='#8ac4a9' if status<300 else '#e2b27d'
      d.text((99,307),f'HTTP {status}',font=f(17,True),fill=col)
      response=scene['response']
      if path=='/api/catalog':
        response={'branches':response['branches'],'services':response['services'][:1],'_display_note':'first service shown; full response in trace.json'}
      lines=json.dumps(response,indent=2).splitlines()
      if len(lines)>12:lines=lines[:11]+['  ... (full response in demo/trace.json)']
      visible=min(len(lines),max(0,(frame-6)//2))
      for n,line in enumerate(lines[:visible]):d.text((100,348+n*19),line[:103],font=f(14,True),fill='#a8b7cf')
      d.text((80,638),'Real requests. Real responses. Synthetic demo data.',font=f(12),fill='#737e99')
    progress=(idx+frame/(seconds*12))/len(scenes)
    d.rounded_rectangle((70,666,1210,670),radius=2,fill='#303653')
    d.rounded_rectangle((70,666,70+max(2,1140*progress),670),radius=2,fill='#a78bfa')
    proc.stdin.write(im.tobytes())
  if idx==4:im.save(root/'demo/demo-poster.png')
proc.stdin.close();proc.wait()
print('Video created:',(root/'demo/slotwise-api-demo.mp4').stat().st_size,'bytes')
