import * as THREE from 'three'
import type { ComponentInstance, ComponentTelemetry } from '../../../model/types'
import type { CatalogEntry } from '../../../model/catalog'
import { topLabel } from '../shared'
import { FIREBEETLE_PINS } from '../../../model/firebeetle'
export const FIREBEETLE_BOARD = {sku:'DFR0654-F',widthMm:25.4,lengthMm:60,pitchMm:2.54} as const
export function buildFireBeetle(comp:ComponentInstance,entry:CatalogEntry,pins:THREE.Vector3[]) {
 const root=new THREE.Group()
 const a={x:pins[0].x-0.65,z:pins[0].z-4}
 const material=(color:number,metalness=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness:0.6})
 const pcb=material(0x172a35), gold=material(0xd8aa4a,0.8),silver=material(0xb4bac0,0.8), black=material(0x151515)
 function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(a.x+x,y,a.z+z);root.add(mesh);return mesh
 }
 box(10,0.35,60/2.54,5,0.175,12,pcb)
 box(7,0.55,6.5,5,0.65,16,silver)
 box(6.5,0.2,3,5,0.45,21,black)
 const usb=box(3.4,0.9,2.3,5,0.75,0.6,silver)
 usb.name='USB-C'
 box(2.8,0.7,2.2,8,0.65,5,material(0xe9dfc2))
 box(3.8,0.35,1.1,5,0.55,11,black)
 for(const [x,z] of [[0.8,2],[9.2,2]]){box(1.1,0.6,1.4,x,0.65,z,black);box(0.7,0.15,0.8,x,1,z,silver)}
 for(let i=0;i<pins.length;i++) {
  const p=pins[i]
  box(0.75,0.35,0.8,p.x-a.x,0.4,p.z-a.z,black)
  box(0.24,0.6,0.24,p.x-a.x,0.4,p.z-a.z,gold)
  const label=topLabel(FIREBEETLE_PINS[i].replace('GPIO','').replace('_2',''),1.15,0.55,{w:128,h:64,fg:'#ffffff'})
  if(label){label.position.set(p.x+(i<18?1.1:-1.1),0.38,p.z);root.add(label)}
 }
 const label=topLabel('FireBeetle 2 ESP32-E',6,1,{w:512,h:100,fg:'#ffffff'})
 if(label){label.position.set(a.x+5,0.94,a.z+16);root.add(label)}
 const ledMat=new THREE.MeshStandardMaterial({color:0x184220,emissive:0x00ff66,emissiveIntensity:0})
 box(0.45,0.18,0.6,1.8,0.45,3,ledMat)
 return {object:root,pinWorld:pins.map(p=>new THREE.Vector3(p.x,0.7,p.z)),update:(_c:ComponentInstance,_e:CatalogEntry,t:ComponentTelemetry|null)=>{ledMat.emissiveIntensity=(t?.ledBrightness??0)*3}}
}
