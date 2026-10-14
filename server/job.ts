import { parentPort, workerData } from 'node:worker_threads'
import { SimEngine, DEFAULT_DT } from '../src/sim/engine'
import { verifyCircuit } from '../src/llm/verify'
try {
  const {
    layout,
    kind,
    seconds = 0.1,
    dt = DEFAULT_DT,
    refs = [],
    samples = 0,
    expectations = [],
  } = workerData
  if (kind === 'verify')
    parentPort!.postMessage(verifyCircuit(layout, expectations))
  else {
    const engine = new SimEngine(layout)
    const trace: any[] = []
    const steps = Math.ceil(seconds / dt),
      stride = Math.max(1, Math.ceil(steps / Math.max(1, samples)))
    for (let i = 0; i < steps; i++) {
      engine.step(Math.min(dt, seconds - engine.time))
      if (samples && i % stride === 0 && trace.length < samples)
        trace.push({
          time: engine.time,
          voltages: Object.fromEntries(
            refs.map((r: string) => [r, engine.netVoltage(r)]),
          ),
        })
    }
    if (samples) {
      const end = {
        time: engine.time,
        voltages: Object.fromEntries(
          refs.map((r: string) => [r, engine.netVoltage(r)]),
        ),
      }
      if (trace.length < samples) trace.push(end)
      else trace[trace.length - 1] = end
    }
    parentPort!.postMessage({
      time: engine.time,
      telemetry: engine.telemetry(),
      issues: engine.issues,
      voltages: Object.fromEntries(
        refs.map((r: string) => [r, engine.netVoltage(r)]),
      ),
      trace,
    })
  }
} catch (e: any) {
  parentPort!.postMessage({ error: e.message })
}
