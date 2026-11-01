/** Mobile/desktop project picker. Editing requires the per-project capability key kept in this browser. */
import { useEffect, useState } from 'react'
import { Sheet, ListGroup, ListRow, PressableButton, showToast } from '../kit'
import type { WorkspaceController } from '../../workspaces/useWorkspaces'
import './workspaces-sheet.css'

export interface WorkspacesSheetProps {
  open: boolean
  onDismiss: () => void
  desktop: boolean
  manager: WorkspaceController
}
export function WorkspacesSheet({open,onDismiss,desktop,manager}:WorkspacesSheetProps) {
  const [snap,setSnap]=useState(1)
  useEffect(()=>{if(open){setSnap(1);void manager.refresh()}},[open])
  const {current,items,editable,busy,loading,saving,dirty,error}=manager
  const guarded=async(action:Promise<boolean>)=>{if(await action)onDismiss()}
  const ask=(label:string,initial:string)=>window.prompt(label,initial)?.trim()
  return <Sheet open={open} onDismiss={onDismiss} snapPoints={[0.6,0.94]} activeSnap={snap} onSnapChange={setSnap} desktop={desktop} anchor="right" ariaLabel="Workspaces" className="asm-sheet">
    <div className="asm-content asm-view ws-view">
      <div className="asm-sheet-head"><span className="lg-title">Workspaces</span><span className="ws-count">{items.length} saved</span></div>
      <p className="ws-helper">Switch between circuits saved on ASUS. Projects you create automatically save new edits.</p>
      {error && <p className="ws-error" role="alert">{error}</p>}
      <ListGroup header="Currently open">
        <ListRow title={current?.name||'Local circuit'} subtitle={saving?'Saving to ASUS…':dirty?(editable?'Unsaved changes':'Edited locally · use Save copy'):editable?'Autosave active':current?'Read-only · Save copy to edit':'Not linked to a workspace'} trailing={<span className="ws-current-mark">●</span>}/>
      </ListGroup>
      <div className="ws-actions">
        <PressableButton size="sm" disabled={busy||loading} onClick={()=>{const name=ask('Name for the current circuit',current?`${current.name} copy`:'My circuit');if(name)void guarded(manager.duplicate(name))}}>Save copy</PressableButton>
        <PressableButton size="sm" variant="tinted" disabled={busy||loading} onClick={()=>{const name=ask('Name for a blank workspace','New circuit');if(name)void guarded(manager.create(name,true))}}>+ New blank</PressableButton>
        {editable&&<PressableButton size="sm" variant="plain" disabled={busy||saving||!dirty} onClick={()=>{void manager.saveNow().then(ok=>{if(ok)showToast('Workspace saved')})}}>Save now</PressableButton>}
      </div>
      <ListGroup header="ASUS projects">
        {loading?<ListRow title="Loading workspaces…"/>:items.length===0?<ListRow title="No workspaces yet" subtitle="Save the current circuit to create your first one"/>:items.map(item=><ListRow key={item.id} title={item.name} subtitle={`${item.components} parts · ${item.wires} wires · ${item.source==='mcp'?'MCP workspace · read-only':item.id===current?.id&&editable?'Editable here':'Saved on ASUS'}`} leading={<span className="ws-folder" aria-hidden="true">{item.source==='mcp'?'◇':'▣'}</span>} trailing={item.id===current?.id?<span className="ws-active">Open</span>:undefined} chevron={item.id!==current?.id} disabled={busy} onPress={()=>{void guarded(manager.open(item.id))}}/>) }
      </ListGroup>
      <ListGroup header="Manage current project">
        {manager.recoveryAvailable&&<ListRow title="Recover previous local circuit" subtitle="Restore an unsaved browser snapshot" onPress={()=>{void guarded(manager.recover())}} disabled={busy}/>}
        {editable?<>
          <ListRow title="Rename" subtitle="Change the project name on ASUS" onPress={()=>{const name=ask('Rename workspace',current?.name||'');if(name)void manager.rename(name)}} disabled={busy}/>
          <ListRow title="Duplicate" subtitle="Create a separately editable copy" onPress={()=>{const name=ask('Name for duplicate',`${current?.name||'Circuit'} copy`);if(name)void guarded(manager.duplicate(name))}} disabled={busy}/>
          <ListRow title="Stop syncing" subtitle="Keep the circuit open in this browser" onPress={()=>{void manager.detach().then(onDismiss)}} disabled={busy}/>
          <ListRow title="Delete from ASUS" subtitle="Permanently remove this saved project" destructive onPress={()=>{void manager.remove()}} disabled={busy}/>
        </>:<ListRow title="Save as an editable project" subtitle="MCP workspaces are read-only here; save a copy to edit safely" onPress={()=>{const name=ask('Save editable copy',`${current?.name||'Circuit'} copy`);if(name)void guarded(manager.duplicate(name))}} disabled={busy}/>}
      </ListGroup>
      <p className="ws-helper">Anyone can view public projects. Editing is protected by a key stored in the browser that created the project. Other browsers can Save copy. MCP administration and firmware APIs remain private.</p>
    </div>
  </Sheet>
}
