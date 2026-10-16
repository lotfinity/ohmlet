/// <reference lib="webworker" />
import { CoupledFirmware } from './coupled'
let coupled:CoupledFirmware|null=null
let serial='',diagnostics=''
self.onmessage=async ({data:a})=>{
  try {
    if(a.type==='load') {
      coupled?.dispose()
      coupled=new CoupledFirmware(s=>{serial+=s},s=>{diagnostics+=s+'\n'})
      await coupled.load(a.layout,a.board,a.images)
      serial='';diagnostics=''
      self.postMessage({type:'ready'})
    } else if(a.type==='advance') {
      if(!coupled) throw Error('No firmware loaded')
      const telemetry=coupled.advance(a.seconds)
      const scope=a.probes.map((p:any)=>({channel:p.channel,v:coupled!.engine.netVoltage(p.ref)}))
      self.postMessage({type:'frame',telemetry,scope,serial,diagnostics})
      serial='';diagnostics=''
    } else if(a.type==='param') coupled?.param(a.id,a.key,a.value)
    else if(a.type==='layout') coupled?.setLayout(a.layout)
    else if(a.type==='serial') coupled?.emu.sendSerial(a.text)
  } catch(e) { self.postMessage({type:'error',error:String(e),serial,diagnostics});serial='';diagnostics='' }
}
