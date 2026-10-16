/** Thin host wrapper around the pinned, MIT-licensed esp32sim WASM build. */
export interface FirmwareImages { rom: Uint8Array; bootloader: Uint8Array; partitions: Uint8Array; app: Uint8Array }
export class FirmwareEmulator {
  private w: any
  private e = 0
  private decoder = new TextDecoder()
  constructor(private serial: (text: string) => void, private diagnostic: (text: string) => void) {}
  async load(images: FirmwareImages, bytes?: BufferSource) {
    this.dispose()
    const binary = bytes ?? await (await fetch('/firmware/esp32sim.wasm')).arrayBuffer()
    const module = await WebAssembly.compile(binary)
    const env: Record<string, Function> = { host_log: (p: number, n: number) => this.diagnostic(this.text(p,n)) }
    // JIT is deliberately disabled: use the emulator's portable interpreter.
    // The module retains JIT imports even when execution never calls them.
    for (const i of WebAssembly.Module.imports(module)) {
      if (i.module !== 'env' || i.kind !== 'function') throw Error(`Unsupported emulator import: ${i.module}.${i.name}`)
      if (!env[i.name]) {
        if(!['host_jit_compile','host_jit_release'].includes(i.name)) throw Error(`Unknown emulator import: ${i.name}`)
        env[i.name] = () => 0
      }
    }
    const instance = await WebAssembly.instantiate(module, {env} as any)
    this.w = instance.exports
    this.e = this.put(new TextEncoder().encode('esp32'), (p,n) => this.w.esp32sim_new(p,n,4,0))
    if (!this.e) throw Error('ESP32 emulator creation failed')
    for (const [kind, data] of [[0,images.rom],[1,images.bootloader],[2,images.partitions],[3,images.app]] as const) {
      if (this.put(data,(p,n)=>this.w.esp32sim_load(this.e,kind,p,n))) throw Error(`Firmware image ${kind} could not load`)
    }
    this.w.esp32sim_set_jit(this.e,0)
    if (this.w.esp32sim_boot(this.e,0)) throw Error('ESP32 boot failed')
  }
  private text(p:number,n:number) { return this.decoder.decode(new Uint8Array(this.w.memory.buffer,p,n)) }
  private put(data: Uint8Array, fn:(p:number,n:number)=>any) {
    const p=this.w.esp32sim_alloc(data.length)
    new Uint8Array(this.w.memory.buffer).set(data,p)
    try { return fn(p,data.length) } finally { this.w.esp32sim_free(p,data.length) }
  }
  get time() { return this.e ? this.w.esp32sim_cycles(this.e)/this.w.esp32sim_cpu_hz(this.e) : 0 }
  run(seconds:number) {
    const rc=this.w.esp32sim_run(this.e,Math.max(1,Math.round(seconds*this.w.esp32sim_cpu_hz(this.e))),Date.now())
    this.drain()
    if (rc) throw Error(`Firmware stopped (emulator code ${rc})`)
  }
  pin(pin:number) {
    const s=this.w.esp32sim_electrify_pin(this.e,pin)
    return {enabled:!!(s&2),high:!!(s&1),pullUp:!!(s&4),pullDown:!!(s&8),
      hz:this.w.esp32sim_electrify_pwm(this.e,pin,0),duty:this.w.esp32sim_electrify_pwm(this.e,pin,1)}
  }
  input(pin:number,level:number,volts=NaN) { this.w.esp32sim_electrify_input(this.e,pin,level,volts) }
  sendSerial(text:string) {
    const data=new TextEncoder().encode(JSON.stringify({t:'key',src:'uart0',data:text}))
    this.put(data,(p,n)=>this.w.esp32sim_in_text(this.e,p,n))
  }
  private drain() {
    const count=this.w.esp32sim_out_take(this.e)
    for(let i=0;i<count;i++) {
      if(this.w.esp32sim_out_kind(this.e,i)!==1) continue
      const text=this.text(this.w.esp32sim_out_ptr(this.e,i),this.w.esp32sim_out_len(this.e,i))
      try {
        const event=JSON.parse(text)
        if(event.t==='serial' && event.src==='uart0') {
          this.serial(event.data)
          if(/Guru Meditation|abort\(\)|Cache disabled/.test(event.data)) throw Error('Firmware panic: see serial console')
        }
      } catch(e) { if(e instanceof SyntaxError) continue; throw e }
    }
  }
  dispose() { if(this.e) this.w.esp32sim_delete(this.e); this.e=0 }
}
