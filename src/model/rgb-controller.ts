/** Photo-derived ALS-001-V1; dimensions are estimates, not manufacturer CAD. */
export const RGB_CONTROLLER_TYPE = 'als001_rgb_controller'
export const RGB_CONTROLLER_WIDTH = 19 / 2.54
export const RGB_CONTROLLER_LENGTH = 34 / 2.54
export const RGB_CONTROLLER_PINS = ['VIN','GND','+12V','G','R','B','VIR','GND_IR','IR']
export function rgbControllerAnchor(slot:number,pos?:{x:number;z:number}) {
 return pos ?? {x:-24,z:slot*30}
}
export function rgbControllerPinPosition(slot:number,index:number,pos?:{x:number;z:number}) {
 const a=rgbControllerAnchor(slot,pos)
 return index<2 ? {x:a.x+2+index*3,z:a.z+0.5} :
  {x:a.x+0.5+(index-2)*(RGB_CONTROLLER_WIDTH-1)/6,z:a.z+RGB_CONTROLLER_LENGTH-0.5}
}
export const RGB_PRESETS:Record<string,[number,number,number]> = {
 red:[1,0,0],green:[0,1,0],blue:[0,0,1],white:[1,1,1],
 yellow:[1,1,0],cyan:[0,1,1],magenta:[1,0,1],orange:[1,0.25,0],
}
