/**
 * FireBeetle 2 ESP32-E (DFR0654-F) procedural visual prototype.
 * Dimensions use Ohmlet units: 1 unit = 2.54 mm.
 * This mesh is intentionally independent of catalog registration: Ohmlet's
 * current offboard placement assumes a 6.5-unit-wide two-terminal instrument.
 * Real header pin positions and electrical behavior must be mapped before
 * exposing this as a wireable component.
 */
import * as THREE from 'three'

export const FIREBEETLE_BOARD = {
  sku: 'DFR0654-F',
  widthMm: 25.4,
  lengthMm: 60,
  pitchMm: 2.54,
} as const

const UNIT = FIREBEETLE_BOARD.pitchMm

/** Board is centered on X/Z; Y=0 is the board underside. */
export function createFireBeetleVisual(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'FireBeetle 2 ESP32-E — visual prototype'
  const pcb = new THREE.Mesh(
    new THREE.BoxGeometry(FIREBEETLE_BOARD.widthMm / UNIT, 0.48, FIREBEETLE_BOARD.lengthMm / UNIT),
    new THREE.MeshStandardMaterial({ color: 0x172a35, roughness: 0.76, metalness: 0.1 }),
  )
  pcb.position.y = 0.24
  pcb.name = 'PCB'
  root.add(pcb)

  const shield = new THREE.Mesh(
    new THREE.BoxGeometry(7.1, 0.68, 8.6),
    new THREE.MeshStandardMaterial({ color: 0xb4bac0, metalness: 0.78, roughness: 0.35 }),
  )
  shield.position.set(0, 0.83, -3.4)
  shield.name = 'ESP32 module RF shield — approximate'
  root.add(shield)

  const usb = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.85, 2.25),
    new THREE.MeshStandardMaterial({ color: 0xa9aeb4, metalness: 0.7, roughness: 0.3 }),
  )
  usb.position.set(0, 0.82, -11.55)
  usb.name = 'USB-C connector — approximate'
  root.add(usb)

  const headerPlastic = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.9 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8aa4a, metalness: 0.8, roughness: 0.25 })
  // Cosmetic header arrays only. Not yet an authoritative pinout.
  for (const x of [-4.35, 4.35]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 19.0), headerPlastic)
    strip.position.set(x, 0.84, 0)
    root.add(strip)
    for (let i = 0; i < 18; i++) {
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.5, 0.3), gold)
      pin.position.set(x, 0.65, -8.5 + i)
      root.add(pin)
    }
  }
  return root
}
