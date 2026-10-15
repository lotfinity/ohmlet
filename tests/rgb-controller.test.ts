import {describe,it,expect} from 'vitest'
import {SimEngine} from '../src/sim/engine'
import {validateLayout} from '../src/model/validate'
import {CATALOG} from '../src/model/catalog'
import {offboardBodyRect,offboardTerminalPosition} from '../src/model/breadboard'
import {buildComponentObject,disposeComponentObject} from '../src/three/component-meshes'
import * as THREE from 'three'
import demo from '../examples/als001-rgb-controller.json'
import type {CircuitLayout} from '../src/model/types'
const layout=()=>structuredClone(demo) as unknown as CircuitLayout
describe('ALS-001-V1 photo-derived controller',()=>{
 it('validates a loaded example and rejects unknown remote modes',()=>{
  expect(validateLayout(demo).errors).toEqual([])
  const l=layout();l.components[1].params!.preset='invented'
  expect(validateLayout(l).ok).toBe(false)
 })
 it('bridges common positive and receiver ground, keeps receiver pads unpowered',()=>{
  const e=new SimEngine(layout());e.advance(.002)
  expect(e.netVoltage('CTRL1:+12V')).toBeCloseTo(e.netVoltage('CTRL1:VIN'),6)
  expect(e.netVoltage('CTRL1:GND_IR')).toBeCloseTo(0,6)
  expect(Math.abs(e.netVoltage('CTRL1:VIR'))).toBeLessThan(.001)
 })
 it('sinks three loaded channels without burning LEDs and changes remote power live',()=>{
  const e=new SimEngine(layout());e.advance(.002)
  for(const pin of ['R','G','B'])expect(e.netVoltage('CTRL1:'+pin)).toBeLessThan(.01)
  for(const id of ['LED0','LED1','LED2']){
   expect(e.telemetry().components[id].current).toBeGreaterThan(.008)
   expect(e.telemetry().components[id].burned).not.toBe(true)
  }
  e.setRuntimeParam('CTRL1','enabled',false);e.advance(.002)
  for(const id of ['LED0','LED1','LED2'])expect(Math.abs(e.telemetry().components[id].current??0)).toBeLessThan(1e-6)
  e.setRuntimeParam('CTRL1','enabled',true);e.setRuntimeParam('CTRL1','preset','blue');e.advance(.002)
  expect(e.telemetry().components.LED2.current).toBeGreaterThan(.008)
  expect(Math.abs(e.telemetry().components.LED0.current??0)).toBeLessThan(1e-6)
  e.setRuntimeParam('PS1','voltage',0);e.advance(.002)
  expect(Math.abs(e.telemetry().components.LED2.current??0)).toBeLessThan(1e-6)
 })
 it('produces 25% loaded PWM and scales brightness',()=>{
  const l=layout();l.components[1].params={preset:'custom',red:.25,green:0,blue:0,frequency:100}
  const e=new SimEngine(l);e.advance(.01)
  let low=0
  for(let i=0;i<2000;i++){e.step(.00005);if(e.netVoltage('CTRL1:R')<.01)low++}
  expect(low/2000).toBeCloseTo(.25,2)
  e.setRuntimeParam('CTRL1','brightness',0);e.advance(.001)
  expect(Math.abs(e.telemetry().components.LED0.current??0)).toBeLessThan(1e-6)
 })
 it('cycles illustrative remote effects and releases flash outputs',()=>{
  const l=layout();l.components[1].params={preset:'jump3',speed:10}
  const e=new SimEngine(l);e.advance(.05)
  expect(e.telemetry().components.CTRL1.outputs).toEqual({R:true,G:false,B:false})
  e.advance(.1)
  expect(e.telemetry().components.CTRL1.outputs).toEqual({R:false,G:true,B:false})
  e.advance(.1)
  expect(e.telemetry().components.CTRL1.outputs).toEqual({R:false,G:false,B:true})
  e.setRuntimeParam('CTRL1','preset','flash');e.advance(.03)
  expect(e.telemetry().components.CTRL1.outputs).toEqual({R:false,G:false,B:false})
 })
 it('releases sinks for reversed and insufficient supply',()=>{
  for(const voltage of [0,5]){
   const l=layout();l.components[0].params={voltage}
   const e=new SimEngine(l);e.advance(.002)
   expect(e.telemetry().components.CTRL1.outputs).toEqual({R:false,G:false,B:false})
  }
  const l=layout();[l.wires[0].to,l.wires[1].to]=[l.wires[1].to,l.wires[0].to]
  const e=new SimEngine(l);e.advance(.002)
  expect(e.telemetry().components.CTRL1.outputs).toEqual({R:false,G:false,B:false})
 })
 it('keeps terminals and mesh inside shared translated bounds and disposes cleanly',()=>{
  const pos={x:-40,z:10},entry=CATALOG.als001_rgb_controller
  const rect=offboardBodyRect(0,pos,entry.type)
  const pins=entry.pins.map((_,i)=>{const p=offboardTerminalPosition(0,i,pos,entry.type);return new THREE.Vector3(p.x,0,p.z)})
  for(const p of pins){expect(p.x).toBeGreaterThan(rect.minX);expect(p.x).toBeLessThan(rect.maxX);expect(p.z).toBeGreaterThan(rect.minZ);expect(p.z).toBeLessThan(rect.maxZ)}
  const built=buildComponentObject({id:'C',type:entry.type,pos},entry,pins)
  expect(built.object.name).toContain('ALS-001')
  for(const p of built.pinWorld)expect(p.y).toBeCloseTo(.7)
  disposeComponentObject(built.object)
 })
})
