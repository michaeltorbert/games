(function(){
  const canvas=document.getElementById('three-bg');
  const api={
    available:false,
    fallbackReason:null,
    lastFrame:0,
    objectCount:0,
    drawCalls:0,
    update(){},
    resize(){},
    snapshot(){
      return {
        available:this.available,
        fallbackReason:this.fallbackReason,
        lastFrame:this.lastFrame,
        objectCount:this.objectCount,
        drawCalls:this.drawCalls,
      };
    },
  };
  window.PragueThreeScene=api;

  if(!canvas){ api.fallbackReason='missing canvas'; return; }
  if(!window.THREE){ api.fallbackReason='three runtime missing'; return; }

  const THREE=window.THREE;
  let renderer;
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  }catch(err){
    api.fallbackReason='webgl unavailable';
    return;
  }

  const scene=new THREE.Scene();
  scene.background=makeSkyTexture();
  scene.fog=new THREE.Fog(0x9fb6bd,8,24);

  const camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,80);
  camera.position.set(0,3.7,12);
  camera.lookAt(0,.5,0);

  const mats={
    hill:new THREE.MeshBasicMaterial({color:0x6f7c76,transparent:true,opacity:.7}),
    far:new THREE.MeshLambertMaterial({color:0x596363,transparent:true,opacity:.62}),
    mid:new THREE.MeshLambertMaterial({color:0x3c4745,transparent:true,opacity:.72}),
    roof:new THREE.MeshLambertMaterial({color:0x3d4648,transparent:true,opacity:.74}),
    copper:new THREE.MeshLambertMaterial({color:0x315f56,transparent:true,opacity:.72}),
    stone:new THREE.MeshLambertMaterial({color:0x877c68,transparent:true,opacity:.65}),
    bridge:new THREE.MeshLambertMaterial({color:0xb79d6c,transparent:true,opacity:.68}),
    river:new THREE.MeshPhongMaterial({color:0x496f78,transparent:true,opacity:.45,shininess:42}),
    lamp:new THREE.MeshBasicMaterial({color:0xffd56f,transparent:true,opacity:.85}),
  };

  scene.add(new THREE.HemisphereLight(0xc9d7d4,0x32423b,1.45));
  const sun=new THREE.DirectionalLight(0xffe0ac,.8);
  sun.position.set(-3,7,8);
  scene.add(sun);

  const root=new THREE.Group();
  const cityFar=new THREE.Group();
  const cityMid=new THREE.Group();
  const bridge=new THREE.Group();
  const river=new THREE.Group();
  const clouds=new THREE.Group();
  root.add(cityFar,cityMid,bridge,river,clouds);
  scene.add(root);

  buildClouds(clouds,mats);
  buildHills(cityFar,mats);
  buildCityLayer(cityFar,mats.far,-7.6,1.1,-8,.62);
  buildCityLayer(cityFar,mats.far,1.6,1.2,-8,.58);
  buildCityLayer(cityMid,mats.mid,-7.2,.45,-5,.8);
  buildCityLayer(cityMid,mats.mid,2.0,.5,-5,.76);
  buildRiver(river,mats);
  buildBridge(bridge,mats);
  addCastleAccent(cityMid,mats);

  api.objectCount=countObjects(scene);
  api.available=true;

  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();
    api.available=false;
    api.fallbackReason='webgl context lost';
  });

  api.resize=function(){
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,canvas.clientWidth||800);
    const h=Math.max(1,canvas.clientHeight||500);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w,h,false);
    const aspect=w/h;
    const viewH=10;
    camera.top=viewH/2;
    camera.bottom=-viewH/2;
    camera.left=-viewH*aspect/2;
    camera.right=viewH*aspect/2;
    camera.updateProjectionMatrix();
  };

  api.update=function(ctx={}){
    if(!api.available) return;
    api.resize();
    const frame=ctx.frame||0;
    const t=frame/60;
    const speed=ctx.gameSpeed||3.5;
    const playerX=ctx.playerX==null?130:ctx.playerX;
    const centerN=(playerX-130)/670;
    camera.position.x=centerN*.55;
    camera.lookAt(centerN*.25,.45,0);

    cityFar.position.x=wrap(-t*speed*.018,-9,9);
    cityMid.position.x=wrap(-t*speed*.032,-9,9);
    bridge.position.x=wrap(-t*speed*.054,-6,6);
    river.position.x=wrap(-t*speed*.045,-8,8);
    river.children.forEach((mesh,i)=>{
      mesh.position.x=wrap(mesh.userData.baseX-t*(.32+i*.03),-11,11);
      mesh.position.y=mesh.userData.baseY+Math.sin(t*1.8+i)*.025;
    });
    clouds.children.forEach((mesh,i)=>{
      mesh.position.x=wrap(mesh.userData.baseX-t*(.16+i*.015),-11,11);
      mesh.material.opacity=.11+Math.sin(t*.45+i)*.025;
    });
    bridge.children.forEach((obj,i)=>{
      if(obj.userData.lamp) obj.material.opacity=.65+Math.sin(t*3+i)*.24;
    });

    renderer.render(scene,camera);
    api.lastFrame=frame;
    api.drawCalls=renderer.info.render.calls;
  };

  window.addEventListener('resize',api.resize);
  api.resize();
  api.update({frame:0});

  function makeSkyTexture(){
    const texCanvas=document.createElement('canvas');
    texCanvas.width=16;
    texCanvas.height=256;
    const ctx=texCanvas.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,0,256);
    grad.addColorStop(0,'#b9cdd3');
    grad.addColorStop(.55,'#97b2b8');
    grad.addColorStop(1,'#5e7475');
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,16,256);
    const tex=new THREE.CanvasTexture(texCanvas);
    if(THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace;
    else tex.encoding=THREE.sRGBEncoding;
    return tex;
  }

  function buildClouds(group,mats){
    const geo=new THREE.PlaneGeometry(2.8,.42);
    for(let i=0;i<9;i++){
      const mat=new THREE.MeshBasicMaterial({color:0xe8eeee,transparent:true,opacity:.1,depthWrite:false});
      const cloud=new THREE.Mesh(geo,mat);
      cloud.position.set(-9+i*2.5,3.9+Math.sin(i)*.25,-12);
      cloud.userData.baseX=cloud.position.x;
      group.add(cloud);
    }
  }

  function buildHills(group,mats){
    const shapes=[
      [[-11,.75],[-8.2,1.65],[-5.1,1.0],[-1.9,1.55],[1.4,.9],[4.3,1.7],[8.5,.85],[11,1.25],[11,-1.2],[-11,-1.2]],
      [[-11,.25],[-7.8,1.0],[-5,.52],[-2.2,1.18],[.6,.4],[3.8,1.05],[6.4,.52],[11,.95],[11,-1.2],[-11,-1.2]],
    ];
    shapes.forEach((pts,idx)=>{
      const shape=new THREE.Shape();
      pts.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
      const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),mats.hill.clone());
      mesh.material.opacity=idx?.35:.28;
      mesh.position.z=-13+idx;
      group.add(mesh);
    });
  }

  function buildCityLayer(group,mat,startX,baseY,z,scale){
    for(let i=0;i<7;i++){
      const x=startX+i*1.5;
      addBlock(group,x,baseY,z,scale,mat);
      if(i%2===0) addTower(group,x+.52,baseY+.35,z,scale,mat);
      if(i%3===1) addSpire(group,x-.42,baseY+.42,z,scale,mat);
    }
  }

  function addBlock(group,x,y,z,s,mat){
    const h=(.7+Math.random()*.35)*s;
    const w=(.9+Math.random()*.38)*s;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,.12),mat);
    mesh.position.set(x,y+h/2,z);
    group.add(mesh);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(w*.62,.38*s,4),mats.roof);
    roof.rotation.y=Math.PI/4;
    roof.position.set(x,y+h+.15*s,z+.03);
    group.add(roof);
  }

  function addTower(group,x,y,z,s,mat){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.24*s,1.25*s,8),mat);
    body.position.set(x,y+.62*s,z+.08);
    group.add(body);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(.34*s,.68*s,6),mats.copper);
    roof.position.set(x,y+1.6*s,z+.08);
    group.add(roof);
    const tip=new THREE.Mesh(new THREE.CylinderGeometry(.025*s,.025*s,.35*s,6),mats.roof);
    tip.position.set(x,y+2.08*s,z+.08);
    group.add(tip);
  }

  function addSpire(group,x,y,z,s,mat){
    const body=new THREE.Mesh(new THREE.BoxGeometry(.32*s,1.45*s,.12),mat);
    body.position.set(x,y+.72*s,z+.12);
    group.add(body);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(.34*s,.92*s,5),mats.roof);
    roof.position.set(x,y+1.86*s,z+.12);
    group.add(roof);
  }

  function addCastleAccent(group,mats){
    const base=new THREE.Mesh(new THREE.BoxGeometry(2.7,.58,.18),mats.stone);
    base.position.set(-1.1,1.22,-4.6);
    group.add(base);
    for(let i=0;i<3;i++) addTower(group,-2.2+i*1.05,1.32,-4.45,.65,mats.stone);
  }

  function buildRiver(group,mats){
    const geo=new THREE.PlaneGeometry(5.8,.22);
    for(let i=0;i<7;i++){
      const mesh=new THREE.Mesh(geo,mats.river.clone());
      mesh.position.set(-10+i*3.4,-.75+Math.sin(i)*.08,-6.8);
      mesh.rotation.x=-.08;
      mesh.userData.baseX=mesh.position.x;
      mesh.userData.baseY=mesh.position.y;
      group.add(mesh);
    }
  }

  function buildBridge(group,mats){
    const deck=new THREE.Mesh(new THREE.BoxGeometry(18,.14,.22),mats.bridge);
    deck.position.set(0,-.42,-4.4);
    group.add(deck);
    for(let i=-5;i<=5;i++){
      const arch=makeArch(mats.bridge);
      arch.position.set(i*1.55,-.7,-4.35);
      group.add(arch);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.055,10,8),mats.lamp.clone());
      lamp.position.set(i*1.55+.68,-.22,-4.18);
      lamp.userData.lamp=true;
      group.add(lamp);
    }
  }

  function makeArch(mat){
    const shape=new THREE.Shape();
    shape.moveTo(-.55,-.2);
    shape.lineTo(-.55,.36);
    shape.quadraticCurveTo(0,.72,.55,.36);
    shape.lineTo(.55,-.2);
    shape.lineTo(.33,-.2);
    shape.lineTo(.33,.28);
    shape.quadraticCurveTo(0,.5,-.33,.28);
    shape.lineTo(-.33,-.2);
    shape.closePath();
    return new THREE.Mesh(new THREE.ShapeGeometry(shape),mat);
  }

  function wrap(v,min,max){
    const span=max-min;
    return ((((v-min)%span)+span)%span)+min;
  }

  function countObjects(obj){
    let n=1;
    obj.children.forEach(child=>{ n+=countObjects(child); });
    return n;
  }
})();
