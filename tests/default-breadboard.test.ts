import {readFileSync, readdirSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {validateLayout} from '../src/model/validate'
import {boardConfigOf, DEFAULT_BOARD, type CircuitLayout} from '../src/model/types'
import {componentPinHoles, formatHole, parseHole} from '../src/model/breadboard'
import {getEntry} from '../src/model/catalog'
import {SimEngine} from '../src/sim/engine'
import {useStore} from '../src/state/store'
import month from '../examples/month-display.json'
import date from '../examples/date-display.json'

const paths=[
  ...readdirSync('examples').filter(p=>p.endsWith('.json')).map(p=>'examples/'+p),
  ...readdirSync('public/firmware/examples').map(p=>'public/firmware/examples/'+p+'/circuit.json'),
]
describe('physical 30-row breadboard lessons',()=>{
  for(const path of paths) it(path+' fits the declared 400-point board(s)',()=>{
    const raw=JSON.parse(readFileSync(path,'utf8'))
    const res=validateLayout(raw)
    expect(res.errors).toEqual([])
    const layout=res.layout!,cfg=boardConfigOf(layout)
    expect(cfg.size).toBe('half');expect(cfg.count).toBe(1)
    expect(cfg.rows).toBe(path==='examples/date-display.json'?2:1)
    const refs=layout.components.flatMap(c=>(componentPinHoles(c,getEntry(c.type)!,cfg)??[]).flatMap(h=>h?[formatHole(h)]:[]))
    refs.push(...layout.wires.flatMap(w=>[w.from,w.to]))
    for(const ref of refs){
      const h=parseHole(ref);if(!h)continue
      expect(h.boardRow??0).toBeLessThan(cfg.rows)
      if(h.kind==='strip'){expect(h.col).toBeGreaterThan(0);expect(h.col).toBeLessThanOrEqual(30)}
      else{expect(h.index).toBeGreaterThanOrEqual(0);expect(h.index).toBeLessThan(25)}
    }
  })
  it('clear starts a 400-point board and undo preserves an existing larger project',()=>{
    const previous=useStore.getState().layout
    const old:CircuitLayout={version:1,components:[{id:'R1',type:'resistor',holes:['a55','a59']}],wires:[]}
    try{
      expect(useStore.getState().loadLayout(old).ok).toBe(true)
      useStore.getState().clearBoard()
      expect(useStore.getState().layout.board).toBe(DEFAULT_BOARD)
      useStore.getState().undo()
      expect(boardConfigOf(useStore.getState().layout).size).toBe('standard')
      expect(useStore.getState().layout.components[0].holes).toEqual(['a55','a59'])
    }finally{useStore.getState().loadLayout(previous)}
  })
  it('the single-board month circuit still displays 06',()=>{
    const layout=validateLayout(month).layout!
    const e=new SimEngine(layout);e.advance(.01)
    const keys=['a','b','c','d','e','f','g']
    const bits=(id:string)=>keys.reduce((n,k,i)=>n+(e.telemetry().components[id]?.segments?.[k]?1<<i:0),0)
    expect(bits('DS1')).toBe(0x3f);expect(bits('DS2')).toBe(0x7c)
  })
  it('the second date board receives power through explicit physical jumpers',()=>{
    const layout=validateLayout(date).layout!
    const powered=new SimEngine(layout);powered.advance(.01)
    expect(powered.netVoltage('1:top+0')).toBeCloseTo(5,2)
    const disconnected=new SimEngine({...layout,wires:layout.wires.filter(w=>!w.id.startsWith('power_board2_'))})
    disconnected.advance(.01)
    expect(disconnected.netVoltage('1:top+0')).toBeLessThan(.1)
  })
})
