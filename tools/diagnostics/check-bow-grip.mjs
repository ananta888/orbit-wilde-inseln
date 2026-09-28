import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('.local', { recursive: true });
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || chromium.executablePath(), headless:true, args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1200,height:660},deviceScaleFactor:1});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/__bow-grip-preview', route=>route.fulfill({contentType:'text/html',body:`<html><head><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script><style>body{margin:0;background:#182129;color:#fff;font:18px sans-serif;display:flex;flex-wrap:wrap}section{width:300px}p{text-align:center}canvas{display:block}</style></head><body></body></html>`}));
  await page.goto((process.env.ORBIT_URL || 'http://127.0.0.1:8765') + '/__bow-grip-preview');
  const reports = await page.evaluate(async()=>{
    const T = await import('three');
    const {InputVisuals} = await import('/src/xr/input-visuals.js');
    const {Bow} = await import('/src/input/bow.js');
    const {BOW_GRIP_RADIUS, BOW_GRIP_LENGTH} = await import('/src/xr/hand-pose.js');
    const reports=[];
    for (const side of ['left','right']) for (const angle of [1,-1]) {
      const scene = new T.Scene(); scene.background=new T.Color('#314354');
      scene.add(new T.HemisphereLight('#ffffff','#51647a',2.4));
      const sun = new T.DirectionalLight('#fff3e1',3);sun.position.set(-1,2,3);scene.add(sun);
      const rig=new T.Group(), controllers=[new T.Group(),new T.Group()], hands=[new T.Group(),new T.Group()], grips=[new T.Group(),new T.Group()];scene.add(rig);rig.add(...controllers,...hands);
      const visual=new InputVisuals({xr:{getControllerGrip:i=>grips[i]}},rig,controllers,hands), bow=new Bow(scene,()=>{});bow.hand=side;
      await visual.loading; if (!visual.ready) throw new Error('Hand assets failed to load');
      for (let i=0;i<2;i++) {
        const handedness=i===0?'left':'right';
        const source={handedness,gamepad:{buttons:[]}};controllers[i].userData.source=source;
        controllers[i].dispatchEvent({type:'connected',data:source});
        grips[i].position.set(handedness===side?0:.4,0,handedness===side?0:.2);
      }
      for(let i=0;i<180;i++){scene.updateMatrixWorld(true);visual.update(1/60,true,bow,false);bow.update(controllers,true,true,i*1000/60);}
      visual.skins.get(side==='left'?'right':'left').root.visible=false;
      const camera=new T.OrthographicCamera(-.115,.115,.24,-.24,.01,3);
      camera.position.set(angle*(side==='left'?1:-1)*.3,.055,.32);camera.lookAt(0,0,.01);
      const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(300,610);renderer.setPixelRatio(1);
      const section=document.createElement('section');section.innerHTML=`<p>${side} / ${angle===1?'palm':'back'}</p>`;section.append(renderer.domElement);document.body.append(section);
      renderer.render(scene,camera);
      const skin=visual.skins.get(side); let minimum=Infinity;
      skin.root.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return; mesh.skeleton.update();
        for (let i=0;i<mesh.geometry.attributes.position.count;i++) {
          const point=bow.root.worldToLocal(mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));
          if(Math.abs(point.y)<BOW_GRIP_LENGTH/2) minimum=Math.min(minimum,Math.hypot(point.x,point.z));
        }
      });
      reports.push({side,angle,minimum,required:BOW_GRIP_RADIUS+.0012,visible:bow.root.visible});
    }
    return reports;
  });
  for (const report of reports) assert(report.visible && report.minimum > report.required, JSON.stringify(report));
  assert.deepEqual(errors, []);
  await page.screenshot({path:'.local/bow-grip-contact.png'});
  console.log('Bow grip: actual hand surfaces clear the handle; left/right palm and back close-ups passed. Browser poses, not physical Quest hardware.');
} finally {await browser.close();}
