import {execFile} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
const root=resolve(process.env.OHMLET_ROOT||process.cwd())
const cli=process.env.OHMLET_ARDUINO_CLI||join(root,'.firmware-tools/arduino-cli')
const config=process.env.OHMLET_ARDUINO_CONFIG||join(root,'.firmware-tools/arduino.yaml')
export const firmwareJobs=new Map<string,any>()
const sandboxReady=()=>existsSync('/usr/bin/bwrap')&&existsSync('/usr/bin/prlimit')
let compiling=false
export function firmwareCompile(source:string) {
  if(typeof source!=='string'||!source.trim()||source.length>50000) throw Error('Provide an Arduino sketch up to 50,000 characters')
  if(!existsSync(cli)||!existsSync(config)) throw Error('Arduino compiler is not installed yet')
  if(!sandboxReady()) throw Error('Compiler sandbox is unavailable')
  if(compiling) throw Error('Another firmware compilation is running; retry shortly')
  // Bounded cache: do not evict an active compilation.
  while(firmwareJobs.size>=8) {
    const first=firmwareJobs.keys().next().value!
    rmSync(join(root,'.firmware-cache',first),{recursive:true,force:true});firmwareJobs.delete(first)
  }
  const id=randomUUID(),dir=join(root,'.firmware-cache',id),sketch=join(dir,'sketch'),build=join(dir,'build')
  mkdirSync(sketch,{recursive:true});writeFileSync(join(sketch,'sketch.ino'),source)
  const job:any={id,status:'compiling',log:'',board:'FireBeetle ESP32',core:'3.3.10'}
  firmwareJobs.set(id,job);compiling=true
  const args=['--config-file',config,'compile','--fqbn','esp32:esp32:firebeetle32','--jobs','1','--build-path',build,sketch]
  // Expose only the installed toolchain and this job; sketches cannot read host files or use the network.
  const sandbox=['--as=2147483648','--cpu=300','--','/usr/bin/bwrap','--unshare-all','--die-with-parent','--new-session',
    '--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64',
    '--proc','/proc','--dev','/dev','--tmpfs','/tmp',
    '--ro-bind',dirname(cli),dirname(cli),'--bind',dir,dir,'--chdir',dir,cli,...args]
  execFile('/usr/bin/prlimit',sandbox,{env:{PATH:'/usr/bin:/bin',HOME:'/tmp',LANG:'C.UTF-8'},timeout:300000,killSignal:'SIGKILL',maxBuffer:2*1024*1024},(error,stdout,stderr)=>{
    compiling=false;job.log=(stdout+'\n'+stderr).slice(-60000)
    if(error) {job.status='error';job.error=error.killed?'Compilation exceeded the five-minute limit':'Compilation failed';return}
    const files=['bin','bootloader.bin','partitions.bin']
    if(!files.every(s=>existsSync(join(build,'sketch.ino.'+s)))) {job.status='error';job.error='Compiler did not produce all firmware images';return}
    job.status='ready';job.images={app:`/api/firmware/jobs/${id}/app`,bootloader:`/api/firmware/jobs/${id}/bootloader`,partitions:`/api/firmware/jobs/${id}/partitions`,rom:'/firmware/esp32_rev300_rom.elf'}
  })
  return job
}
export async function firmwareApi(req:any,res:any,pathname:string,body:()=>Promise<any>) {
  if(!pathname.startsWith('/api/firmware/')) return false
  const json=(status:number,value:any)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
  if(pathname==='/api/firmware/health') {json(200,{compiler:existsSync(cli)&&existsSync(config)&&sandboxReady(),sandbox:sandboxReady(),compiling,engine:'esp32sim',target:'esp32',couplingStepMs:0.5});return true}
  if(pathname==='/api/firmware/compile'&&req.method==='POST') {const a=await body();json(202,firmwareCompile(a.source));return true}
  const match=pathname.match(/^\/api\/firmware\/jobs\/([a-f0-9-]{36})(?:\/(app|bootloader|partitions))?$/)
  if(match&&req.method==='GET') {
    const job=firmwareJobs.get(match[1]);if(!job){json(404,{error:'Firmware job expired or unknown'});return true}
    if(!match[2]) {json(200,job);return true}
    if(job.status!=='ready'){json(409,{error:'Firmware is not compiled'});return true}
    const suffix:Record<string,string>={app:'bin',bootloader:'bootloader.bin',partitions:'partitions.bin'}
    const data=readFileSync(join(root,'.firmware-cache',match[1],'build','sketch.ino.'+suffix[match[2]]))
    res.writeHead(200,{'content-type':'application/octet-stream','content-length':data.length,'cache-control':'no-store'});res.end(data);return true
  }
  json(404,{error:'Firmware route not found'});return true
}
