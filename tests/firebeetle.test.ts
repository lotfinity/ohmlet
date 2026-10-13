
import {describe,it,expect} from 'vitest'
import {SimEngine} from '../src/sim/engine'
import {validateLayout} from '../src/model/validate'
import {offboardTerminalPosition,offboardBodyRect} from '../src/model/breadboard'
import {CATALOG} from '../src/model/catalog'
import demo from '../examples/firebeetle-blink.json'
import type {CircuitLayout} from '../src/model/types'
import {useStore} from '../src/state/store'
const board=(params:Record<string,number|string|boolean>={}):CircuitLayout=>({version:1 as const,components:[{id:'ESP1',type:'firebeetle_esp32e',params}],wires:[]})
describe('FireBeetle DFR0654-F',()=>{
 it('validates the blink lesson and round-trips named terminals',()=>{
  const result=validateLayout(demo)
  expect(result.errors).toEqual([])
  expect(useStore.getState().loadLayout(demo as unknown as CircuitLayout).ok).toBe(true)
  expect(JSON.parse(useStore.getState().exportJson()).wires).toEqual(demo.wires)
 })
 it('has 32 distinct header contacts and matching geometry at arbitrary positions',()=>{
  const pins=CATALOG.firebeetle_esp32e.pins
  expect(pins).toHaveLength(32)
  expect(new Set(pins).size).toBe(32)
  const pos={x:-40,z:12}
  const rect=offboardBodyRect(0,pos,'firebeetle_esp32e')
  for(let i=0;i<pins.length;i++){
   const p=offboardTerminalPosition(0,i,pos,'firebeetle_esp32e')
   expect(p.x).toBeGreaterThan(rect.minX);expect(p.x).toBeLessThan(rect.maxX)
   expect(p.z).toBeGreaterThan(rect.minZ);expect(p.z).toBeLessThan(rect.maxZ)
  }
 })
 it('supplies 3.3V, drives GPIO high/low, bridges duplicate headers',()=>{
  const e=new SimEngine(board({gpio21_mode:'high'}));e.advance(0.001)
  expect(e.netVoltage('ESP1:3V3')).toBeCloseTo(3.3,3)
  expect(e.netVoltage('ESP1:VCC')).toBeCloseTo(4.7,3)
  expect(e.netVoltage('ESP1:GPIO21_2')).toBeCloseTo(3.3,3)
  e.setRuntimeParam('ESP1','gpio21_mode','low');e.advance(0.001)
  expect(e.netVoltage('ESP1:GPIO21')).toBeCloseTo(0,3)
  expect(e.issues.filter(i=>i.level==='error')).toEqual([])
 })
 it('blinks a real resistor/LED load without burning it, with low and high PWM phases',()=>{
  const e=new SimEngine(demo as unknown as CircuitLayout)
  e.advance(0.01);expect(e.telemetry().components.LED1.ledBrightness).toBeGreaterThan(0)
  expect(e.telemetry().components.ESP1.ledBrightness).toBeGreaterThan(0.8)
  e.advance(0.55);expect(e.netVoltage('ESP1:GPIO2')).toBeLessThan(0.01)
  expect(e.telemetry().components.LED1.burned).not.toBe(true)
  e.setRuntimeParam('ESP1','gpio2_duty',0);e.advance(0.01)
  expect(e.netVoltage('ESP1:GPIO2')).toBeLessThan(0.01)
  e.setRuntimeParam('ESP1','gpio2_duty',1);e.advance(0.01)
  expect(e.netVoltage('ESP1:GPIO2')).toBeGreaterThan(3)
 })
 it('releases GPIOs on reset and USB power off',()=>{
  const l=board({gpio2_mode:'high'})
  l.components.push({id:'R1',type:'resistor',params:{resistance:10000},holes:['a1','a2']} )
  l.wires.push({id:'W1',from:'ESP1:GPIO2',to:'b1'},{id:'W2',from:'ESP1:GND',to:'b2'})
  const e=new SimEngine(l);e.advance(0.001);expect(e.netVoltage('ESP1:GPIO2')).toBeGreaterThan(3)
  e.setRuntimeParam('ESP1','reset',true);e.advance(0.001);expect(e.netVoltage('ESP1:GPIO2')).toBeLessThan(0.01)
  e.setRuntimeParam('ESP1','reset',false);e.setRuntimeParam('ESP1','powered',false);e.advance(0.001)
  expect(e.netVoltage('ESP1:GPIO2')).toBeLessThan(0.01)
 })
 it('reads external signals on high-impedance inputs',()=>{
  const l=board()
  l.components.push({id:'FG1',type:'function_generator',params:{amplitude:0,offset:2.1}})
  l.wires.push({id:'W1',from:'FG1:out',to:'ESP1:GPIO34'},{id:'W2',from:'FG1:gnd',to:'ESP1:GND'})
  const e=new SimEngine(l);e.advance(0.001)
  expect(e.netVoltage('ESP1:GPIO34')).toBeCloseTo(2.1,3)
  expect(e.telemetry().components.ESP1.outputs?.GPIO34).toBe(true)
 })
 it('moves the full board with undo/redo and rejects board collisions',()=>{
  const store=useStore.getState()
  expect(store.loadLayout(board()).ok).toBe(true)
  expect(store.setInstrumentPos('ESP1',{x:-40,z:10}).ok).toBe(true)
  expect(useStore.getState().layout.components[0].pos).toEqual({x:-40,z:10})
  store.undo()
  expect(useStore.getState().layout.components[0].pos).toBeUndefined()
  store.redo()
  expect(useStore.getState().layout.components[0].pos).toEqual({x:-40,z:10})
  expect(store.setInstrumentPos('ESP1',{x:0,z:0}).ok).toBe(false)
 })
 it('input-only GPIOs never source current, even with malformed imported modes',()=>{
  const e=new SimEngine(board({gpio34_mode:'high'}));e.advance(0.001)
  expect(e.netVoltage('ESP1:GPIO34')).toBeLessThan(0.01)
 })
})
