import * as THREE from 'three'
import type { ComponentInstance, ComponentTelemetry } from '../../../model/types'
import type { CatalogEntry } from '../../../model/catalog'
import { topLabel } from '../shared'
import { loadGltfScene } from '../gltf-overrides'
import { disposeComponentObject } from '../../component-meshes'
import { FIREBEETLE_SOCKET_Y, FIREBEETLE_LEFT_X, FIREBEETLE_FIRST_Z, FIREBEETLE_PINS } from '../../../model/firebeetle'
export const FIREBEETLE_BOARD = {sku:'DFR0654-F',widthMm:25.4,lengthMm:60,pitchMm:2.54} as const
function buildFireBeetleFallback(comp:ComponentInstance,entry:CatalogEntry,pins:THREE.Vector3[]) {
 const root=new THREE.Group()
 const a={x:pins[0].x-FIREBEETLE_LEFT_X,z:pins[0].z-FIREBEETLE_FIRST_Z}
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
  box(0.9,3.25,0.95,p.x-a.x,2.35,p.z-a.z,black)
  box(0.4,0.03,0.4,p.x-a.x,FIREBEETLE_SOCKET_Y,p.z-a.z,material(0x050505))
  const label=topLabel(FIREBEETLE_PINS[i].replace('GPIO','').replace('_2',''),1.15,0.55,{w:128,h:64,fg:'#ffffff'})
  if(label){label.position.set(p.x+(i<18?1.1:-1.1),0.38,p.z);root.add(label)}
 }
 const label=topLabel('FireBeetle 2 ESP32-E',6,1,{w:512,h:100,fg:'#ffffff'})
 if(label){label.position.set(a.x+5,0.94,a.z+16);root.add(label)}
 const ledMat=new THREE.MeshStandardMaterial({color:0x184220,emissive:0x00ff66,emissiveIntensity:0})
 box(0.45,0.18,0.6,1.8,0.45,3,ledMat)
 return {object:root,pinWorld:pins.map(p=>new THREE.Vector3(p.x,FIREBEETLE_SOCKET_Y,p.z)),update:(_c:ComponentInstance,_e:CatalogEntry,t:ComponentTelemetry|null)=>{ledMat.emissiveIntensity=(t?.ledBrightness??0)*3}}
}

// One lazy cached asset load. Each board clones nodes but shares immutable GPU assets.
let modelPromise: Promise<THREE.Group | null> | null = null
export function buildFireBeetle(comp:ComponentInstance,entry:CatalogEntry,pins:THREE.Vector3[]) {
 const fallback=buildFireBeetleFallback(comp,entry,pins)
 const root=new THREE.Group()
 root.name='FireBeetle 2 ESP32-E DFR0654-F'
 root.add(fallback.object)
 const a={x:pins[0].x-FIREBEETLE_LEFT_X,z:pins[0].z-FIREBEETLE_FIRST_Z}
 const ledMaterial=new THREE.MeshStandardMaterial({color:0x17475e,emissive:0x2288ff,emissiveIntensity:0})
 const led=new THREE.Mesh(new THREE.BoxGeometry(.24,.06,.24),ledMaterial)
 led.name='GPIO2 onboard LED'
 led.position.set(a.x+2.1,.82,a.z+.67)
 led.visible=false
 root.add(led)
 if(typeof window!=='undefined' && typeof document!=='undefined') {
  modelPromise ??= loadGltfScene('/models/firebeetle-esp32e.glb').catch(()=>null)
  void modelPromise.then(model=>{
   if(root.userData.disposed)return
   if(!model){root.userData.modelError=true;return}
   const instance=model.clone(true)
   instance.name='Manufacturer CAD model'
   instance.position.set(a.x,0,a.z)
   instance.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true}})
   root.add(instance)
   root.remove(fallback.object)
   disposeComponentObject(fallback.object)
   led.visible=true
   root.userData.modelLoaded=true
   root.updateMatrixWorld(true)
  })
 }
 return {object:root,pinWorld:pins.map(p=>new THREE.Vector3(p.x,FIREBEETLE_SOCKET_Y,p.z)),update:(c:ComponentInstance,e:CatalogEntry,t:ComponentTelemetry|null)=>{
  if(!root.userData.modelLoaded)fallback.update(c,e,t)
  ledMaterial.emissiveIntensity=(t?.ledBrightness??0)*3
 }}
}
