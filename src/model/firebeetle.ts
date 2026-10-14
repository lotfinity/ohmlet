/** DFR0654-F header order, USB at the top. Source: https://wiki.dfrobot.com/dfr0654-f/ */
export const FIREBEETLE_LEFT = ['RST','3V3','NC','GND','EN','GPIO18','GPIO23','GPIO19','GPIO22','GPIO21','GPIO2','GPIO13','GPIO14','GPIO0','GPIO26','GPIO25','GPIO1','GPIO3']
export const FIREBEETLE_RIGHT = ['VCC','3V3_2','GND_2','GPIO22_2','GPIO21_2','GPIO15','GPIO35','GPIO34','GPIO39','GPIO36','GPIO12','GPIO4','GPIO16','GPIO17']
export const FIREBEETLE_PINS = [...FIREBEETLE_LEFT, ...FIREBEETLE_RIGHT]
export const FIREBEETLE_GPIOS = [0,1,2,3,4,12,13,14,15,16,17,18,19,21,22,23,25,26,34,35,36,39]
export const FIREBEETLE_INPUT_ONLY = [34,35,36,39]
export const FIREBEETLE_ADC = [0,2,4,12,13,14,15,25,26,34,35,36,39]
export const FIREBEETLE_ALIASES: Record<number,string> = {0:'D5',1:'TX',2:'D9 / LED',3:'RX',4:'D12',12:'D13',13:'D7',14:'D6',15:'A4',16:'D11',17:'D10',18:'SCK',19:'MISO',21:'SDA',22:'SCL',23:'MOSI',25:'D2',26:'D3',34:'A2',35:'A3',36:'A0',39:'A1'}
export function firebeetleAnchor(slot: number, pos?: {x:number;z:number}) {
 return pos ?? {x:-24,z:slot*30}
}
// Socket centres and height measured from the manufacturer's DFR0654 STEP model.
export const FIREBEETLE_SOCKET_Y = (8.3 + 1.8064) / 2.54
export const FIREBEETLE_LEFT_X = 1.25 / 2.54
export const FIREBEETLE_RIGHT_X = 24.25 / 2.54
export const FIREBEETLE_FIRST_Z = 11.62 / 2.54
export function offboardTerminalHeight(type: string): number {
 return type === 'firebeetle_esp32e' ? FIREBEETLE_SOCKET_Y : 0.7
}
export function firebeetlePinPosition(slot:number, index:number, pos?:{x:number;z:number}) {
 const a=firebeetleAnchor(slot,pos)
 return index<18 ? {x:a.x+FIREBEETLE_LEFT_X,z:a.z+FIREBEETLE_FIRST_Z+index} : {x:a.x+FIREBEETLE_RIGHT_X,z:a.z+FIREBEETLE_FIRST_Z+4+index-18}
}
