import {useEffect,useRef,useState} from 'react'
import {useStore} from '../../state/store'
import {firmwareRuntime,useFirmware} from '../../firmware/runtime'
import {Sheet,PressableButton} from '../kit'
import type {CircuitLayout} from '../../model/types'
import type {FirmwareImages} from '../../firmware/emulator'
const examples=[['blink','LED blink'],['button','Button → LED'],['pwm','PWM dimming'],['adc_pwm','Pot → brightness']]
export function FirmwareSheet({open,onDismiss,desktop}:{open:boolean;onDismiss:()=>void;desktop?:boolean}) {
  const [source,setSource]=useState(()=>{try{return localStorage.getItem('bb.firmwareSource')||''}catch{return ''}})
  const [busy,setBusy]=useState(false),[log,setLog]=useState(''),[error,setError]=useState('')
  const [snap,setSnap]=useState(1),[serialInput,setSerialInput]=useState('')
  const state=useFirmware(),layout=useStore(s=>s.layout),running=useStore(s=>s.running)
  const generation=useRef(0)
  const board=layout.components.find(c=>c.type==='firebeetle_esp32e')
  useEffect(()=>{try{localStorage.setItem('bb.firmwareSource',source)}catch{}},[source])
  const read=async(url:string)=>{const r=await fetch(url);if(!r.ok)throw Error('Could not load '+url);return new Uint8Array(await r.arrayBuffer())}
  const attach=async(urls:Record<string,string>,target:CircuitLayout=useStore.getState().layout)=>{
    const selected=target.components.find(c=>c.type==='firebeetle_esp32e')
    if(!selected)throw Error('Add a FireBeetle board or load a demo circuit first')
    const data=await Promise.all(['rom','bootloader','partitions','app'].map(k=>read(urls[k])))
    const images=Object.fromEntries(['rom','bootloader','partitions','app'].map((k,i)=>[k,data[i]])) as unknown as FirmwareImages
    useStore.getState().stopSim()
    await firmwareRuntime.load(target,selected.id,images)
  }
  const demo=async(name:string)=>{
    if(busy)return
    setBusy(true);setError('');generation.current++
    try {
      const r=await fetch(`/firmware/examples/${name}/sketch.ino`);if(!r.ok)throw Error('Demo sketch unavailable');setSource(await r.text())
      const c=await fetch(`/firmware/examples/${name}/circuit.json`);const target=await c.json()
      useStore.getState().stopSim();firmwareRuntime.unload();useStore.getState().resetSim()
      const loaded=useStore.getState().loadLayout(target)
      if(!loaded.ok)throw Error(loaded.errors.join('; '))
      await attach(Object.fromEntries(['rom','bootloader','partitions','app'].map(k=>[k,k==='rom'?'/firmware/esp32_rev300_rom.elf':`/firmware/examples/${name}/${k}.bin`])),target)
      setLog('Loaded tested Arduino firmware. Press Run to execute it on this circuit.')
    } catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const compile=async()=>{
    if(busy||!board)return
    const seq=++generation.current;setBusy(true);setError('');setLog('Compiling Arduino sketch…')
    try {
      let r=await fetch('/api/firmware/compile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source})})
      let job=await r.json();if(!r.ok)throw Error(job.error||'Compiler unavailable')
      const deadline=Date.now()+330000
      while(job.status==='compiling') {
        if(seq!==generation.current)return
        if(Date.now()>deadline)throw Error('Compiler did not finish in time')
        await new Promise(resolve=>setTimeout(resolve,1000))
        r=await fetch(`/api/firmware/jobs/${job.id}`);job=await r.json();if(!r.ok)throw Error(job.error)
      }
      setLog(job.log||'')
      if(job.status!=='ready')throw Error(job.error||'Compilation failed')
      if(seq===generation.current)await attach(job.images)
    }catch(e){setError(String(e))}finally{if(seq===generation.current)setBusy(false)}
  }
  return <Sheet open={open} onDismiss={onDismiss} desktop={desktop} anchor="right" snapPoints={[.55,.92]} activeSnap={snap} onSnapChange={setSnap} ariaLabel="ESP32 Firmware" className="asm-sheet">
    <div className="asm-content firmware-panel">
      <div className="asm-sheet-head"><span className="lg-title">ESP32 Firmware</span></div>
      <p>Run Arduino code on the FireBeetle and interact with your circuit.</p>
      <p className="firmware-note">Experimental · GPIO/ADC sampled every 0.5 ms · PWM up to 1 kHz, approximate phase · Wi-Fi/Bluetooth unavailable.</p>
      <div className="asm-chips">{examples.map(([id,label])=><button className="asm-chip lg-hit" disabled={busy} key={id} onClick={()=>void demo(id)}>{label} demo</button>)}</div>
      <small>Demo buttons replace the circuit and load compiled firmware. Circuit changes can be undone.</small>
      <label className="firmware-label" htmlFor="firmware-code">Arduino sketch · {board?.id||'add a FireBeetle board'}</label>
      <textarea id="firmware-code" className="asm-textarea firmware-code" rows={12} spellCheck={false} value={source} onChange={e=>setSource(e.target.value)} placeholder={'void setup() {\n}\n\nvoid loop() {\n}'} />
      <PressableButton variant="filled" className="asm-block" disabled={busy||!board||!source.trim()} onClick={()=>void compile()}>{busy?'Preparing firmware…':'Compile & load sketch'}</PressableButton>
      <div className="firmware-actions">
        <button disabled={!state.active||busy} onClick={()=>running?useStore.getState().stopSim():useStore.getState().startSim()}>{running?'Pause':'Run'}</button>
        <button disabled={!state.active||busy} onClick={()=>useStore.getState().resetSim()}>Reset</button>
        <button disabled={!state.active||busy} onClick={()=>{useStore.getState().stopSim();firmwareRuntime.unload();useStore.getState().resetSim()}}>Manual GPIO mode</button>
      </div>
      <p role="status">{state.status}</p>
      {(error||state.error)&&<p role="alert" className="firmware-error">{error||state.error}</p>}
      {layout.components.filter(c=>c.type==='pushbutton').map(c=><button className="asm-chip lg-hit" key={c.id} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);useStore.getState().setParam(c.id,'pressed',true)}} onPointerUp={()=>useStore.getState().setParam(c.id,'pressed',false)} onPointerCancel={()=>useStore.getState().setParam(c.id,'pressed',false)} onKeyDown={e=>{if(e.key===' '||e.key==='Enter')useStore.getState().setParam(c.id,'pressed',true)}} onKeyUp={()=>useStore.getState().setParam(c.id,'pressed',false)}>Hold {c.id}</button>)}
      {layout.components.filter(c=>c.type==='potentiometer').map(c=><label key={c.id} className="firmware-label">{c.id} position<input aria-label={`${c.id} position`} type="range" min="0" max="1" step=".01" value={Number(c.params?.position??.5)} onChange={e=>useStore.getState().setParam(c.id,'position',Number(e.target.value))}/></label>)}
      <label className="firmware-label">Serial monitor</label>
      <pre className="firmware-console" aria-label="Serial monitor">{state.serial||'Serial output will appear here.'}</pre>
      <form className="firmware-actions" onSubmit={e=>{e.preventDefault();firmwareRuntime.serial(serialInput+'\n');setSerialInput('')}}><input aria-label="Serial input" value={serialInput} onChange={e=>setSerialInput(e.target.value)}/><button disabled={!state.active}>Send</button></form>
      {log&&<details><summary>Compiler output</summary><pre className="firmware-console">{log}</pre></details>}
    </div>
  </Sheet>
}
