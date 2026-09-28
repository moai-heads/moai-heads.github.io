// ALPINE-01: original synthesized cues, controlled by real WASM vehicle state.
// Explicit user-gesture unlock; no autoplay, no sound while hidden/unfocused.
export function mixFor({throttle=0,speed=0,airborne=false}={}) {
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:0));
  const t=clamp(Math.abs(throttle),0,1), s=clamp(Math.abs(speed)/42,0,1);
  const load=clamp(t*.78+s*.42,0,1), contact=airborne?0:1;
  return {
    engine_idle:{gain:.43*Math.sqrt(1-load),rate:.92+load*.50},
    engine_load:{gain:.68*Math.sqrt(load),rate:.64+s*.72+t*.35},
    snow_track:{gain:.40*Math.sqrt(s)*contact,rate:.75+s*.80},
    wind:{gain:.34*s,rate:.8+s*.42},
  };
}

export function installHeroAudio() {
  const button=document.createElement('button');button.id='hero-sound';
  button.type='button';button.textContent='SOUND · OFF';button.setAttribute('aria-pressed','false');
  button.title='Enable snowmobile engine and snow audio (M). Starts muted.';
  Object.assign(button.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'20',
    padding:'10px 15px',border:'1px solid #637180',borderRadius:'7px',background:'#15212ee8',
    color:'#edf4fa',font:'bold 11px system-ui,sans-serif',letterSpacing:'1.2px',cursor:'pointer'});
  document.body.append(button);
  let ctx=null,master=null,enabled=false,busy=false,ready=false,focused=document.hasFocus();
  let state={throttle:0,speed:0,brake:0,airborne:false,verticalSpeed:0};
  let heartbeat=-Infinity,lastBrake=-Infinity,lastLanding=-Infinity,previous=null;
  const buffers=new Map(),loops=new Map();
  const cueNames=['engine_idle','engine_load','snow_track','wind','engine_start','brake_snow','landing'];
  const set=(p,v,t=.09)=>p.setTargetAtTime(v,ctx.currentTime,t);
  function active() { return enabled && ready && focused && !document.hidden && performance.now()-heartbeat<600; }
  function oneShot(name,volume=1) {
    if(!active()||!buffers.has(name)) return;
    const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buffers.get(name);
    gain.gain.value=volume;src.connect(gain).connect(master);src.start();
    src.onended=()=>{src.disconnect();gain.disconnect();};
  }
  async function prepare() {
    if(ready)return;
    if(!ctx) {
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Audio)throw new Error('Web Audio is unavailable');
      ctx=new Audio();
      master=ctx.createGain();master.gain.value=0;
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=9;
      limiter.ratio.value=5;limiter.attack.value=.006;limiter.release.value=.14;
      master.connect(limiter).connect(ctx.destination);
    }
    // resume is called before the first await: still inside the click/key gesture.
    await ctx.resume();
    await Promise.all(cueNames.map(async name=>{
      if(buffers.has(name))return;
      const url=new URL(`./audio/alpine_01/${name}.wav`,import.meta.url);
      url.search=new URL(import.meta.url).search;
      const response=await fetch(url);
      if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
      buffers.set(name,await ctx.decodeAudioData(await response.arrayBuffer()));
    }));
    for(const name of ['engine_idle','engine_load','snow_track','wind']) {
      const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buffers.get(name);src.loop=true;
      src.loopStart=0;src.loopEnd=src.buffer.duration;gain.gain.value=0;
      src.connect(gain).connect(master);src.start();loops.set(name,{src,gain});
    }
    ready=true;
  }
  async function toggle() {
    if(busy)return;
    if(enabled) { enabled=false;paint();if(master)set(master.gain,0,.025);return; }
    busy=true;button.textContent='SOUND · LOADING';
    try {
      await prepare();await ctx.resume();enabled=true;focused=document.hasFocus();
      paint();if(active())set(master.gain,.68,.04);oneShot('engine_start',.55);
    } catch(error) {
      enabled=false;button.textContent='SOUND · RETRY';button.setAttribute('aria-pressed','false');
      console.warn('ALPINE-01 audio:',error);
    } finally { busy=false; }
  }
  function paint() {
    button.textContent=enabled?'SOUND · ON':'SOUND · OFF';button.setAttribute('aria-pressed',String(enabled));
  }
  button.addEventListener('click',()=>{void toggle();button.blur();});
  window.addEventListener('keydown',event=>{
    if(event.code==='KeyM'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&
       !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName||'')) {event.preventDefault();void toggle();}
  });
  window.addEventListener('blur',()=>{focused=false;previous=null;if(master)set(master.gain,0,.02);});
  window.addEventListener('focus',()=>{focused=true;});
  document.addEventListener('visibilitychange',()=>{
    previous=null;if(document.hidden&&master)set(master.gain,0,.02);
  });
  globalThis.dunesHeroAudioUpdate=(throttle,speed,brake,airborne,verticalSpeed)=>{
    const now=performance.now();state={throttle,speed,brake,airborne,verticalSpeed};heartbeat=now;
    if(previous && ready) {
      if(previous.airborne&&!airborne&&now-lastLanding>700&&Math.abs(previous.verticalSpeed)>1.2) {
        oneShot('landing',Math.min(.65,.18+Math.abs(previous.verticalSpeed)/18));lastLanding=now;
      }
      if(brake>.5&&previous.brake<=.5&&Math.abs(speed)>2&&now-lastBrake>650) {
        oneShot('brake_snow',Math.min(.55,.1+Math.abs(speed)/75));lastBrake=now;
      }
    }
    previous=state;
  };
  // Fixed low-rate mixer control; shader/physics heartbeat may run faster.
  const timer=setInterval(()=>{
    if(!ready)return;
    set(master.gain,active()?.68:0,.045);
    const mix=mixFor(state);
    for(const [name,{src,gain}] of loops) {
      set(gain.gain,mix[name].gain,.09);set(src.playbackRate,mix[name].rate,.14);
    }
  },50);
  window.addEventListener('pagehide',()=>{
    enabled=false;clearInterval(timer);if(ctx)void ctx.close();
  },{once:true});
  // Read-only diagnostics for smoke tests / project handoff (not an audio control).
  globalThis.dunesHeroAudioStatus=()=>({enabled,ready,context:ctx?.state||'uninitialized',
    loopCount:loops.size,active:active(),state:{...state},mix:mixFor(state)});
}
