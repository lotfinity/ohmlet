import { FirmwareEmulator, type FirmwareImages } from './emulator'
import { SimEngine, DEFAULT_DT } from '../sim/engine'
import { buildNetlist } from '../sim/netlist'
import { FIREBEETLE_ADC, FIREBEETLE_GPIOS } from '../model/firebeetle'
import type { CircuitLayout, ParamValue } from '../model/types'
/** Co-simulation prototype: 0.5ms sample/hold GPIO coupling; PWM phase approximate. */
export class CoupledFirmware {
  readonly emu: FirmwareEmulator
  engine!: SimEngine
  board!: string
  private linked=new Set<number>()
  private states = new Map<number, number>()
  private powered=true
  private resetHeld=false
  constructor(serial:(s:string)=>void, diagnostic:(s:string)=>void) { this.emu=new FirmwareEmulator(serial,diagnostic) }
  async load(layout:CircuitLayout,board:string,images:FirmwareImages,wasm?:BufferSource) {
    this.setLayout(layout,board)
    await this.emu.load(images,wasm)
  }
  setLayout(layout:CircuitLayout,board=this.board) {
    if(!layout.components.some(c=>c.id===board&&c.type==='firebeetle_esp32e')) throw Error('Select a FireBeetle ESP32 board in this circuit')
    if(layout.components.filter(c=>c.type==='firebeetle_esp32e').length!==1) throw Error('Firmware mode currently supports one FireBeetle per circuit')
    this.board=board;this.engine=new SimEngine(layout);this.engine.time=this.emu.time
    const comp=layout.components.find(c=>c.id===board)!
    this.powered=comp.params?.powered!==false;this.resetHeld=comp.params?.reset===true
    const nets=buildNetlist(layout);this.linked.clear()
    for(const pin of FIREBEETLE_GPIOS) {
      const net=nets.netOf(`${board}:GPIO${pin}`)
      if(layout.wires.some(w=>[w.from,w.to].some(end=>end!==`${board}:GPIO${pin}`&&net&&nets.netOf(end)===net))) this.linked.add(pin)
    }
    this.states.clear()
  }
  param(id:string,key:string,value:ParamValue) {
    this.engine.setRuntimeParam(id,key,value)
    if(id===this.board&&key==='powered')this.powered=value!==false
    if(id===this.board&&key==='reset')this.resetHeld=value===true
  }
  advance(duration:number) {
    if(!this.powered||this.resetHeld) throw Error('Turn board power on and release its reset control, then reset firmware from the Code panel')
    const end=this.emu.time+Math.max(0,Math.min(.05,duration))
    const brightness:Record<string,number>={};let samples=0
    while(this.emu.time<end-1e-9) {
      const dt=Math.min(.0005,end-this.emu.time)
      // Resolve the circuit using the most recent firmware output state.
      let pwmActive=false
      for(const pin of FIREBEETLE_GPIOS) {
        const s=this.emu.pin(pin)
        const pwm=s.hz>0
        pwmActive ||= pwm
        if(pwm && s.hz>1000.01) throw Error(`GPIO${pin}: PWM above 1 kHz is not supported by this circuit bridge yet`)
        const mode=pwm?'pwm':s.enabled?(s.high?'high':'low'):'input'
        this.engine.setRuntimeParam(this.board,`gpio${pin}_mode`,mode)
        this.engine.setRuntimeParam(this.board,`gpio${pin}_pull`,s.pullUp?'up':s.pullDown?'down':'none')
        if(pwm) {
          this.engine.setRuntimeParam(this.board,`gpio${pin}_frequency`,s.hz)
          this.engine.setRuntimeParam(this.board,`gpio${pin}_duty`,s.duty)
        }
      }
      this.engine.advance(dt,DEFAULT_DT)
      if(pwmActive) {
        const t=this.engine.telemetry();samples++
        for(const [id,comp] of Object.entries(t.components)) if(comp.ledBrightness!==undefined) brightness[id]=(brightness[id]??0)+comp.ledBrightness
      }
      for(const pin of FIREBEETLE_GPIOS) {
        const s=this.emu.pin(pin)
        const gnd=this.engine.netVoltage(`${this.board}:GND`)
        const v=this.engine.netVoltage(`${this.board}:GPIO${pin}`)-gnd
        // Unconnected pads keep emulator pull resolution; connected pads follow circuit voltage.
        if(this.linked.has(pin) && Number.isFinite(v)) {
          if(v>3.6||v<-.3) throw Error(`GPIO${pin}: circuit input is outside the ESP32 voltage range`)
          let level=this.states.get(pin)??0
          if(v>2.0) level=1
          if(v<.8) level=0
          this.states.set(pin,level)
          this.emu.input(pin,level,FIREBEETLE_ADC.includes(pin)?Math.max(0,Math.min(3.3,v)):NaN)
        } else this.emu.input(pin,-1)
      }
      this.emu.run(dt)
      this.engine.time=this.emu.time
    }
    const telemetry=this.engine.telemetry()
    // Display-only frame average avoids aliasing a fast PWM LED into a static on/off image.
    // Pin voltages and circuit solving remain instantaneous.
    if(samples) for(const [id,sum] of Object.entries(brightness)) telemetry.components[id].ledBrightness=sum/samples
    return telemetry
  }
  dispose() { this.emu.dispose() }
}
