import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {CoupledFirmware} from '../src/firmware/coupled'
import {validateLayout} from '../src/model/validate'
import type {CircuitLayout} from '../src/model/types'
const data=(p:string)=>new Uint8Array(readFileSync(p))
async function setup(name:string) {
 const dir=`public/firmware/examples/${name}`
 const layout=JSON.parse(readFileSync(`${dir}/circuit.json`,'utf8')) as CircuitLayout
 expect(validateLayout(layout).errors).toEqual([])
 let serial='';const diagnostic:string[]=[]
 const c=new CoupledFirmware(s=>{serial+=s},s=>diagnostic.push(s))
 await c.load(layout,'ESP1',{rom:data('public/firmware/esp32_rev300_rom.elf'),bootloader:data(`${dir}/bootloader.bin`),partitions:data(`${dir}/partitions.bin`),app:data(`${dir}/app.bin`)},data('public/firmware/esp32sim.wasm'))
 return {c,text:()=>serial,diagnostic}
}
function advance(c:CoupledFirmware,seconds:number) {let t=c.emu.time+seconds;while(c.emu.time<t-1e-6)c.advance(Math.min(.02,t-c.emu.time))}
describe('compiled Arduino ESP32 firmware coupled to actual circuit solver',()=>{
 it('blinks the loaded LED circuit through actual firmware GPIO output',async()=>{
  const {c,text}=await setup('blink')
  try {
   advance(c,.3);expect(text()).toContain('READY blink')
   const levels:number[]=[]
   for(let i=0;i<8;i++){advance(c,.25);levels.push(c.engine.netVoltage('ESP1:GPIO2'))}
   expect(levels.some(v=>v>3)).toBe(true);expect(levels.some(v=>v<.1)).toBe(true)
   expect(c.engine.telemetry().components.LED1.burned).not.toBe(true)
   expect(text()).not.toMatch(/Guru Meditation|abort\(\)/)
  } finally {c.dispose()}
 },30000)
 it('feeds a real circuit button back into digitalRead and drives the onboard LED',async()=>{
  const {c,text}=await setup('button')
  try {
   advance(c,.3);expect(c.engine.netVoltage('ESP1:GPIO2')).toBeLessThan(.1)
   c.param('SW1','pressed',true);advance(c,.05)
   expect(c.engine.netVoltage('ESP1:GPIO2')).toBeGreaterThan(3)
   c.param('SW1','pressed',false);advance(c,.05)
   expect(c.engine.netVoltage('ESP1:GPIO2')).toBeLessThan(.1)
   expect(text()).toContain('READY button')
  }finally{c.dispose()}
 },30000)
 it('maps firmware LEDC PWM to the existing electrical output model',async()=>{
  const {c,text}=await setup('pwm')
  try {
   advance(c,.3);const p=c.emu.pin(2)
   expect(p.hz).toBeCloseTo(1000,0);expect(p.duty).toBeCloseTo(.5,2)
   expect(text()).toContain('READY pwm');expect(c.engine.telemetry().components.LED1.burned).not.toBe(true)
  }finally{c.dispose()}
 },30000)
 it('feeds potentiometer voltage into analogRead and changes PWM duty',async()=>{
  const {c,text}=await setup('adc_pwm')
  try {
   c.param('RV1','position',0);advance(c,.3);const low=c.emu.pin(2).duty
   c.param('RV1','position',.5);advance(c,.3);const mid=c.emu.pin(2).duty
   c.param('RV1','position',.9);advance(c,.3);const high=c.emu.pin(2).duty
   expect(low).toBeLessThan(.1);expect(mid).toBeGreaterThan(.3);expect(mid).toBeLessThan(.7);expect(high).toBeGreaterThan(mid+.2)
   expect(text()).toContain('READY adc_pwm')
  }finally{c.dispose()}
 },30000)
})
