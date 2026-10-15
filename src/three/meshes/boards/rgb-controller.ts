import * as THREE from 'three'
import type {ComponentInstance} from '../../../model/types'
import type {CatalogEntry} from '../../../model/catalog'
import {topLabel} from '../shared'
import {RGB_CONTROLLER_WIDTH as W,RGB_CONTROLLER_LENGTH as L,RGB_CONTROLLER_PINS} from '../../../model/rgb-controller'
export function buildRgbController(_comp:ComponentInstance,_entry:CatalogEntry,pins:THREE.Vector3[]) {
 const root=new THREE.Group();root.name='ALS-001-V1 RGB controller (photo reconstruction)'
 const a={x:pins[0].x-2,z:pins[0].z-0.5}
 const mat=(c:number,m=0)=>new THREE.MeshStandardMaterial({color:c,metalness:m,roughness:.6})
 const green=mat(0x19734b),brown=mat(0x995d36),black=mat(0x171719),silver=mat(0xb8babe,.8),copper=mat(0xc48b52,.7),trace=mat(0x3b9766)
 function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material) {
  const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(a.x+x,y,a.z+z);root.add(o);return o
 }
 function label(text:string,x:number,z:number,w:number=2,y:number=.43) {
  const l=topLabel(text,w,.5,{w:256,h:64,fg:'#ffffff'})
  if(l){l.position.set(a.x+x,y,a.z+z);root.add(l)}
 }
 box(W,.35,L,W/2,.175,L/2,brown);box(W-.35,.03,L-.15,W/2,.365,L/2,green)
 box(3.5,2.7,3.3,W/2,1.7,.6,black)
 const bore=new THREE.Mesh(new THREE.CylinderGeometry(.95,.95,.04,20),black)
 bore.rotation.x=Math.PI/2;bore.position.set(a.x+W/2,1.7,a.z-1.07);root.add(bore)
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.83,.12,6,20),silver)
 ring.position.copy(bore.position);ring.position.z-=.03;root.add(ring)
 box(.18,.18,.8,W/2,1.7,-.8,silver)
 box(2.1,.45,2.4,2.7,.64,7.9,black);label('U1',1,7.7,1)
 for(let j=0;j<4;j++)for(const x of [1.35,4.05])box(.7,.12,.28,x,.5,7+j*.55,silver)
 for(let j=0;j<3;j++){
  const x=1+j*1.3
  box(.8,.38,.9,x,.6,10.8,black)
  for(const dx of [-.3,.3])box(.2,.1,.45,x+dx,.45,10.15,silver)
  box(.3,.1,.4,x,.45,11.4,silver)
  label('T'+(j+1),x,9.9,.8)
  box(.13,.02,1.3,x,.395,12,trace)
 }
 box(.7,.2,1.2,1.2,.52,4.4,black);label('391',1.2,4.4,.65,.64)
 box(.4,.25,1.15,1.2,.55,2.6,mat(0xb22c22));label('D1',2,2.6,.8)
 for(let i=0;i<8;i++)box(.45,.02,.38,5+(i<4?0:1.6),.4,7.1+(i%4)*.6,copper)
 label('U2',6,9.6,1)
 // Exposed solder joints and mask traces follow the photographed layout;
 // their appearance is illustrative, not an extracted PCB netlist.
 const traceVertices:number[]=[]
 function track(points:number[][],width=.12){
  for(let i=1;i<points.length;i++){
   const [x,z]=points[i-1],[u,v]=points[i],d=Math.hypot(u-x,v-z)
   const dx=-(v-z)/d*width/2,dz=(u-x)/d*width/2
   const q=[[x+dx,z+dz],[x-dx,z-dz],[u+dx,v+dz],[u-dx,v-dz]]
   for(const j of [0,1,2,2,1,3])traceVertices.push(a.x+q[j][0],.405,a.z+q[j][1])
  }
 }
 for(let i=0;i<3;i++){
  track([[1+i*1.3,10.2],[1+i*1.3,9.4],[1.6+i*.6,8.9]])
  track([[1.6+i*.8,6.9],[1.6+i*.8,6],[4.5+i*.7,4.8],[4.5+i*.7,2.8],[4.2,2]])
 }
 track([[6.8,12.6],[6.8,6.6],[5.8,5.4],[5.8,3.3],[4.2,2.5]],.18)
 track([[.5,12.6],[.5,6],[1.5,5.8]],.2)
 const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(traceVertices,3));tg.computeVertexNormals()
 root.add(new THREE.Mesh(tg,new THREE.MeshStandardMaterial({color:0x145337,side:THREE.DoubleSide,roughness:.8})))
 for(const [x,z,sx,sz] of [[3.8,3.4,.55,.45],[3.8,5,.6,.4]]){
  box(sx*2,.03,sz*2,x,.41,z,copper)
  const joint=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),silver)
  joint.scale.set(sx,.28,sz);joint.position.set(a.x+x,.55,a.z+z);root.add(joint)
 }
 const eyelet=new THREE.Mesh(new THREE.TorusGeometry(.43,.13,6,12),copper)
 eyelet.rotation.x=Math.PI/2;eyelet.position.set(a.x+5.7,.42,a.z+4.2);root.add(eyelet)
 label('ALS-001-V1',W/2,5.8,4.8)
 for(let i=0;i<pins.length;i++){
  const p=pins[i];box(i<2?.65:.65,.3,.9,p.x-a.x,.55,p.z-a.z,silver)
  label(RGB_CONTROLLER_PINS[i],p.x-a.x,p.z-a.z-(i<2?-1:1),i<2?1.5:.9,.72)
 }
 return {object:root,pinWorld:pins.map(p=>new THREE.Vector3(p.x,.7,p.z))}
}
