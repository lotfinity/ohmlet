
import {describe,it,expect} from 'vitest'
import {validateLayout} from '../src/model/validate'
import {SimEngine} from '../src/sim/engine'
import type {CircuitLayout} from '../src/model/types'
import button from '../examples/firebeetle-button.json'
import pot from '../examples/firebeetle-adc-pot.json'
import pwm from '../examples/firebeetle-pwm-dimming.json'
import mosfet from '../examples/firebeetle-mosfet.json'
import divider from '../examples/firebeetle-divider.json'
import rectifier from '../examples/ac-dc-smoothing.json'
function engine(raw:unknown){
 const v=validateLayout(raw)
 expect(v.errors).toEqual([])
 expect(v.layout).toBeDefined()
 const e=new SimEngine(v.layout as CircuitLayout)
 e.advance(0.005)
 expect(e.issues.filter(i=>i.level==='error')).toEqual([])
 return e
}
describe('electronics learning examples',()=>{
 for(const [name,raw] of Object.entries({button,pot,pwm,mosfet,divider,rectifier})){
  it(name+' validates and solves',()=>{engine(raw)})
 }
 it('button reads HIGH released and LOW pressed',()=>{
  const e=engine(button)
  expect(e.netVoltage('ESP1:GPIO13')).toBeCloseTo(3.3,2)
  e.setRuntimeParam('SW1','pressed',true);e.advance(0.002)
  expect(e.netVoltage('ESP1:GPIO13')).toBeLessThan(0.01)
  e.setRuntimeParam('SW1','pressed',false);e.advance(0.002)
  expect(e.netVoltage('ESP1:GPIO13')).toBeCloseTo(3.3,2)
 })
 it('pot spans 0 to 3.3V at the ADC pin',()=>{
  const e=engine(pot)
  expect(e.netVoltage('ESP1:GPIO34')).toBeCloseTo(1.65,2)
  e.setRuntimeParam('RV1','position',0);e.advance(0.002)
  expect(e.netVoltage('ESP1:GPIO34')).toBeLessThan(0.01)
  e.setRuntimeParam('RV1','position',1);e.advance(0.002)
  expect(e.netVoltage('ESP1:GPIO34')).toBeCloseTo(3.3,2)
 })
 it('PWM duty changes the fraction of high samples and the LED remains intact',()=>{
  const e=engine(pwm)
  function highs(){
   let high=0
   for(let i=0;i<400;i++){e.step(0.00005);if(e.netVoltage('ESP1:GPIO2')>2.5)high++}
   return high/400
  }
  expect(highs()).toBeCloseTo(0.25,1)
  e.setRuntimeParam('ESP1','gpio2_duty',0.75)
  expect(highs()).toBeCloseTo(0.75,1)
  expect(e.telemetry().components.LED1.burned).not.toBe(true)
 })
 it('GPIO switches the separate MOSFET-driven LED load',()=>{
  const e=engine(mosfet)
  e.setRuntimeParam('ESP1','gpio16_mode','high');e.advance(0.005)
  expect(e.telemetry().components.LED1.ledBrightness).toBeGreaterThan(0.5)
  e.setRuntimeParam('ESP1','gpio16_mode','low');e.advance(0.005)
  expect(e.telemetry().components.LED1.ledBrightness).toBeLessThan(0.01)
  expect(e.issues.filter(i=>i.level==='error')).toEqual([])
 })
 it('divider reduces 12V to 3V and 6V to 1.5V',()=>{
  const e=engine(divider)
  expect(e.netVoltage('ESP1:GPIO34')).toBeCloseTo(3,2)
  e.setRuntimeParam('PS1','voltage',6);e.advance(0.002)
  expect(e.netVoltage('ESP1:GPIO34')).toBeCloseTo(1.5,2)
 })
 it('rectifier output stays positive with less ripple than unfiltered AC',()=>{
  const e=engine(rectifier);e.advance(0.15)
  const out:number[]=[],input:number[]=[]
  for(let i=0;i<800;i++){e.step(0.00005);out.push(e.netVoltage('d15'));input.push(e.netVoltage('b10'))}
  expect(Math.min(...out)).toBeGreaterThan(2)
  expect(Math.max(...out)-Math.min(...out)).toBeLessThan(2)
  expect(Math.min(...input)).toBeLessThan(-5)
  // The generator has 50-ohm output impedance; diode charging loads the positive peak.
  expect(Math.max(...input)).toBeGreaterThan(4.5)
  expect(e.issues.filter(i=>i.level==='error')).toEqual([])
  expect(e.issues.some(i=>i.message==='no power supply')).toBe(false)
 })
})
