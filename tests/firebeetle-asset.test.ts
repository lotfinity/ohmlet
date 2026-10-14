
import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {firebeetlePinPosition,FIREBEETLE_SOCKET_Y} from '../src/model/firebeetle'
const data=readFileSync(new URL('../public/models/firebeetle-esp32e.glb',import.meta.url))
const json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString())
describe('FireBeetle CAD asset',()=>{
 it('is a self-contained compact GLB with textures and a real-time triangle budget',()=>{
  expect(data.readUInt32LE(0)).toBe(0x46546c67)
  expect(data.readUInt32LE(4)).toBe(2)
  expect(data.readUInt32LE(8)).toBe(data.length)
  expect(data.length).toBeLessThan(500000)
  let triangles=0
  for(const mesh of json.meshes)for(const p of mesh.primitives)triangles+=json.accessors[p.indices].count/3
  expect(triangles).toBeGreaterThan(4000)
  expect(triangles).toBeLessThan(15000)
  expect(json.images.length).toBe(3)
  expect(json.images.every((im:{bufferView?:number;uri?:string})=>im.bufferView!==undefined && !im.uri)).toBe(true)
 })
 it('contains female headers and fits the board footprint including the projecting USB port',()=>{
  const names=json.nodes.map((n:{name?:string})=>n.name)
  expect(names).toContain('female-header-left')
  expect(names).toContain('female-header-right')
  for(const mesh of json.meshes)for(const p of mesh.primitives){
   const a=json.accessors[p.attributes.POSITION]
   expect(a.min[0]).toBeGreaterThanOrEqual(-0.1)
   expect(a.max[0]).toBeLessThanOrEqual(10.1)
   expect(a.min[2]).toBeGreaterThanOrEqual(-0.65)
   expect(a.max[2]).toBeLessThanOrEqual(24)
   expect(a.max[1]).toBeLessThanOrEqual(4.1)
  }
 })
 it('keeps socket centres on the 2.54mm pitch and wire attachment at their top',()=>{
  const pos={x:0,z:0}
  const a=firebeetlePinPosition(0,0,pos),b=firebeetlePinPosition(0,1,pos)
  expect(b.z-a.z).toBeCloseTo(1,10)
  expect(FIREBEETLE_SOCKET_Y).toBeCloseTo(3.9789,3)
 })
})
