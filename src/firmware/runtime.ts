import {create} from 'zustand'
import type {CircuitLayout,ParamValue,SimTelemetry} from '../model/types'
import type {FirmwareImages} from './emulator'
export const useFirmware=create<{status:string;serial:string;error:string|null;active:boolean}>(()=>({status:'Manual GPIO mode',serial:'',error:null,active:false}))
class FirmwareRuntime {
  active=false
  onFrame:((telemetry:SimTelemetry,scope:any[])=>void)|null=null
  onError:(()=>void)|null=null
  private worker:Worker|null=null
  private loaded:{layout:CircuitLayout;board:string;images:FirmwareImages}|null=null
  private timer:ReturnType<typeof setTimeout>|null=null
  private running=false
  private busy=false
  private ready=false
  private speed=1
  private probes:any[]=[]
  async load(layout:CircuitLayout,board:string,images:FirmwareImages) {
    this.unload();this.loaded={layout,board,images};this.active=true
    useFirmware.setState({active:true,status:'Loading firmware…',error:null,serial:''})
    this.worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'})
    this.worker.onerror=e=>this.fail(e.message||'Firmware worker stopped')
    const worker=this.worker
    this.worker.onmessage=({data:a})=>{
      if(worker!==this.worker)return
      if(a.serial) useFirmware.setState(s=>({serial:(s.serial+a.serial).slice(-40000)}))
      if(a.type==='ready') {this.ready=true;useFirmware.setState({status:'Ready · press Run'});if(this.running)this.pump()}
      if(a.type==='error') this.fail(a.error)
      if(a.type==='frame') {
        this.busy=false;this.onFrame?.(a.telemetry,a.scope)
        if(this.running) this.timer=setTimeout(()=>this.pump(),16)
      }
    }
    this.probes=layout.components.filter(c=>c.type==='scope_probe').map(c=>({channel:Number(c.params?.channel??1)-1,ref:c.holes?.[0]})).filter(p=>p.ref)
    this.worker.postMessage({type:'load',layout,board,images})
  }
  private fail(error:string) {this.pause();this.ready=false;useFirmware.setState({status:'Firmware stopped',error});this.onError?.()}
  private pump() {
    if(!this.running||!this.ready||this.busy)return
    this.busy=true;this.worker?.postMessage({type:'advance',seconds:Math.min(.05,.016*this.speed),probes:this.probes})
  }
  start() {this.running=true;useFirmware.setState({status:this.ready?'Running firmware':'Loading firmware…'});this.pump()}
  pause() {this.running=false;if(this.timer)clearTimeout(this.timer);this.timer=null;if(this.active)useFirmware.setState({status:'Paused'})}
  reset() {if(this.loaded){const x=this.loaded;void this.load(x.layout,x.board,x.images)}}
  unload() {this.pause();this.worker?.terminate();this.worker=null;this.active=false;this.loaded=null;this.busy=false;this.ready=false;useFirmware.setState({active:false,status:'Manual GPIO mode',error:null})}
  param(id:string,key:string,value:ParamValue) {
    if(this.loaded) this.loaded.layout={...this.loaded.layout,components:this.loaded.layout.components.map(c=>c.id===id?{...c,params:{...c.params,[key]:value}}:c)}
    this.worker?.postMessage({type:'param',id,key,value})
  }
  layout(layout:CircuitLayout) {if(this.loaded){this.loaded.layout=layout;this.worker?.postMessage({type:'layout',layout})}}
  setSpeed(speed:number) {this.speed=speed}
  serial(text:string) {this.worker?.postMessage({type:'serial',text})}
}
export const firmwareRuntime=new FirmwareRuntime()
