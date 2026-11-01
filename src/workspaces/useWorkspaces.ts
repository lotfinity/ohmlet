/** Workspace manager: browser autosave + narrow ASUS project API (no MCP exposure). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { CircuitLayout } from '../model/types'
import { showToast } from '../ui/kit'

const CURRENT_KEY = 'bb.currentProject'
const EDIT_KEYS = 'bb.projectEditKeys'
const API = '/api/workspaces'
export interface WorkspaceInfo {
  id: string
  name: string
  description: string
  source: 'mcp' | 'saved'
  revision: number
  components: number
  wires: number
  updatedAt: string | null
}
interface WorkspaceDocument extends WorkspaceInfo { layout: CircuitLayout; editKey?: string }
export interface WorkspaceController {
  items: WorkspaceInfo[]
  current: WorkspaceInfo | null
  editable: boolean
  loading: boolean
  busy: boolean
  saving: boolean
  dirty: boolean
  error: string | null
  refresh: () => Promise<void>
  open: (id: string) => Promise<boolean>
  create: (name: string, blank?: boolean) => Promise<boolean>
  duplicate: (name: string) => Promise<boolean>
  rename: (name: string) => Promise<boolean>
  remove: () => Promise<boolean>
  saveNow: () => Promise<boolean>
  detach: () => Promise<void>
  recoveryAvailable: boolean
  recover: () => Promise<boolean>
}
const fresh = (): CircuitLayout => ({version:1,board:'half',components:[],wires:[]})
function keys(): Record<string,string> {
  try { return JSON.parse(localStorage.getItem(EDIT_KEYS)||'{}') as Record<string,string> } catch { return {} }
}
function keyOf(id: string): string | undefined { return keys()[id] }
function keepKey(id: string,key: string) {localStorage.setItem(EDIT_KEYS,JSON.stringify({...keys(),[id]:key}))}
function dropKey(id: string) {const next=keys();delete next[id];localStorage.setItem(EDIT_KEYS,JSON.stringify(next))}
async function request<T>(path: string, method='GET', data?: object): Promise<T> {
  const response=await fetch(API+path,{method,cache:'no-store',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined})
  const result=await response.json()
  if(!response.ok)throw new Error(result.error || `Workspace request failed (${response.status})`)
  return result as T
}
function message(e: unknown): string {return e instanceof Error?e.message:String(e)}

export function useWorkspaces(): WorkspaceController {
  const [items,setItems]=useState<WorkspaceInfo[]>([])
  const [current,setCurrent]=useState<WorkspaceInfo|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [saving,setSaving]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const currentRef=useRef<WorkspaceInfo|null>(null)
  const dirtyRef=useRef(false)
  const suppressed=useRef(false)
  const blocked=useRef(false)
  const savingRef=useRef<Promise<boolean>|null>(null)
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null)

  const changeCurrent=useCallback((next:WorkspaceInfo|null)=>{
    currentRef.current=next;setCurrent(next)
    if(next)localStorage.setItem(CURRENT_KEY,next.id)
    else localStorage.removeItem(CURRENT_KEY)
  },[])
  const changeDirty=useCallback((value:boolean)=>{dirtyRef.current=value;setDirty(value)},[])
  const patchInfo=useCallback((entry:WorkspaceInfo)=>{
    setItems(old=>old.map(x=>x.id===entry.id?entry:x))
    if(currentRef.current?.id===entry.id)changeCurrent(entry)
  },[changeCurrent])
  const saveNow=useCallback(async ():Promise<boolean>=>{
    if(timer.current!==null){clearTimeout(timer.current);timer.current=null}
    const active=currentRef.current
    const editKey=active&&keyOf(active.id)
    if(!active || active.source!=='saved'||!editKey||!dirtyRef.current)return true
    if(blocked.current)return false
    if(savingRef.current)return savingRef.current
    const layout=useStore.getState().layout
    const revision=active.revision
    changeDirty(false)
    setSaving(true)
    const task=(async()=>{
      try {
        const result=await request<WorkspaceDocument>('/'+active.id,'PUT',{editKey,expectedRevision:revision,layout})
        if(currentRef.current?.id===active.id)patchInfo(result)
        return true
      }catch(e){
        changeDirty(true)
        setError(message(e))
        if(message(e).includes('changed elsewhere')||message(e).includes('edit key'))blocked.current=true
        showToast('Workspace save failed: '+message(e),{duration:4500})
        return false
      }finally{setSaving(false)}
    })()
    savingRef.current=task
    const ok=await task
    savingRef.current=null
    if(ok && dirtyRef.current && currentRef.current?.id===active.id && !blocked.current){
      timer.current=setTimeout(()=>{void saveNow()},1200)
    }
    return ok
  },[changeDirty,patchInfo])
  useEffect(()=>{
    let live=true
    const initialize=async()=>{
      try{
        const result=await request<{workspaces:WorkspaceInfo[]}>('')
        if(!live)return
        setItems(result.workspaces)
        const selected=localStorage.getItem(CURRENT_KEY)
        if(selected){
          const existing=result.workspaces.find(x=>x.id===selected)
          if(existing){
            const doc=await request<WorkspaceDocument>('/'+selected)
            if(!live)return
            // Keep a recoverable snapshot if a previous offline edit differs from the server copy.
            const local=useStore.getState().layout
            if(JSON.stringify(local)!==JSON.stringify(doc.layout)&&local.components.length){
              localStorage.setItem('bb.workspaceRecovery',JSON.stringify(local))
            }
            suppressed.current=true
            const loaded=useStore.getState().loadLayout(doc.layout)
            suppressed.current=false
            if(loaded.ok)changeCurrent(existing)
            else setError('Saved workspace could not be loaded')
          }
        }
      }catch(e){if(live)setError('Workspaces unavailable: '+message(e))}
      finally{if(live)setLoading(false)}
    }
    void initialize()
    return ()=>{live=false}
  },[changeCurrent])
  useEffect(()=>{
    const unsubscribe=useStore.subscribe((s,previous)=>{
      if(s.layout===previous.layout || suppressed.current)return
      const active=currentRef.current
      if(!active)return
      changeDirty(true)
      if(active.source==='saved' && keyOf(active.id) && !blocked.current){
        if(timer.current!==null)clearTimeout(timer.current)
        timer.current=setTimeout(()=>{void saveNow()},1400)
      }
    })
    return ()=>{unsubscribe();if(timer.current!==null)clearTimeout(timer.current)}
  },[changeDirty,saveNow])
  const refresh=useCallback(async()=>{
    try{const result=await request<{workspaces:WorkspaceInfo[]}>('');setItems(result.workspaces);setError(null)}
    catch(e){setError(message(e))}
  },[])
  const flush=useCallback(async()=>{
    const active=currentRef.current
    if(active?.source==='saved'&&keyOf(active.id)&&dirtyRef.current)return saveNow()
    if(active&&dirtyRef.current){
      if(!window.confirm('You have unsaved changes to this read-only workspace. Switch and discard those changes?'))return false
    } else if(!active&&useStore.getState().layout.components.length){
      if(!window.confirm('Your current local circuit is not saved as a workspace. Switch anyway? It will remain in your browser recovery snapshot.'))return false
      localStorage.setItem('bb.workspaceRecovery',JSON.stringify(useStore.getState().layout))
    }
    return true
  },[saveNow])
  const open=useCallback(async(id:string):Promise<boolean>=>{
    if(currentRef.current?.id===id && !blocked.current)return true
    if(!(await flush()))return false
    setBusy(true)
    try{
      const result=await request<WorkspaceDocument>('/'+encodeURIComponent(id))
      suppressed.current=true
      const loaded=useStore.getState().loadLayout(result.layout)
      suppressed.current=false
      if(!loaded.ok)throw new Error(loaded.errors.join('; '))
      changeCurrent(result);changeDirty(false);blocked.current=false;setError(null)
      showToast('Opened '+result.name)
      return true
    }catch(e){setError(message(e));showToast(message(e));return false}
    finally{suppressed.current=false;setBusy(false)}
  },[flush,changeCurrent,changeDirty])
  const create=useCallback(async(name:string,blank=false):Promise<boolean>=>{
    if(!name.trim())return false
    if(blank && !(await flush()))return false
    setBusy(true)
    try{
      const layout=blank?fresh():useStore.getState().layout
      const result=await request<WorkspaceDocument>('', 'POST', {name,layout})
      if(!result.editKey)throw new Error('Edit key not returned')
      keepKey(result.id,result.editKey)
      if(blank){suppressed.current=true;useStore.getState().loadLayout(layout);suppressed.current=false}
      changeCurrent(result);changeDirty(false);blocked.current=false
      setItems(old=>[...old,result]);setError(null)
      showToast('Created '+result.name+' · autosave enabled')
      return true
    }catch(e){setError(message(e));showToast(message(e));return false}
    finally{suppressed.current=false;setBusy(false)}
  },[flush,changeCurrent,changeDirty])
  const duplicate=useCallback(async(name:string)=>create(name,false),[create])
  const rename=useCallback(async(name:string):Promise<boolean>=>{
    const active=currentRef.current,editKey=active&&keyOf(active.id)
    if(!active||active.source!=='saved'||!editKey)return false
    if(!(await saveNow()))return false
    setBusy(true)
    try{
      const result=await request<WorkspaceDocument>('/'+active.id,'PATCH',{name,editKey,expectedRevision:currentRef.current!.revision})
      patchInfo(result);setError(null);showToast('Renamed workspace');return true
    }catch(e){setError(message(e));showToast(message(e));return false}
    finally{setBusy(false)}
  },[saveNow,patchInfo])
  const remove=useCallback(async():Promise<boolean>=>{
    const active=currentRef.current,editKey=active&&keyOf(active.id)
    if(!active||active.source!=='saved'||!editKey)return false
    if(!window.confirm('Delete "'+active.name+'" permanently from ASUS? This cannot be undone.'))return false
    setBusy(true)
    try{
      await request('/'+active.id,'DELETE',{editKey,expectedRevision:active.revision})
      dropKey(active.id);setItems(old=>old.filter(x=>x.id!==active.id));changeCurrent(null);changeDirty(false);blocked.current=false;setError(null)
      showToast('Workspace deleted; circuit remains open locally');return true
    }catch(e){setError(message(e));showToast(message(e));return false}
    finally{setBusy(false)}
  },[changeCurrent,changeDirty])
  const detach=useCallback(async()=>{
    if(!(await flush()))return
    changeCurrent(null);changeDirty(false);blocked.current=false
  },[flush,changeCurrent,changeDirty])
  const recover=useCallback(async():Promise<boolean>=>{
    const raw=localStorage.getItem('bb.workspaceRecovery');if(!raw)return false
    if(!(await flush()))return false
    try {
      suppressed.current=true
      const result=useStore.getState().loadLayout(JSON.parse(raw))
      suppressed.current=false
      if(!result.ok)throw new Error(result.errors.join('; '))
      localStorage.removeItem('bb.workspaceRecovery')
      changeCurrent(null);changeDirty(false);blocked.current=false;setError(null)
      showToast('Recovered local circuit — Save copy to keep it on ASUS')
      return true
    }catch(e){suppressed.current=false;setError(message(e));showToast(message(e));return false}
  },[flush,changeCurrent,changeDirty])
  return {items,current,editable:!!(current?.source==='saved'&&keyOf(current.id)),loading,busy,saving,dirty,error,refresh,open,create,duplicate,rename,remove,saveNow,detach,recoveryAvailable:!!localStorage.getItem('bb.workspaceRecovery'),recover}
}
