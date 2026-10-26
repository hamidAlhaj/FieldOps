import { BadRequestException, ConflictException } from "@nestjs/common";
export type WorkingHour={day:number;startMinute:number;endMinute:number};
export function parseUtcInstant(value:string):Date{
  // Require an explicit Z or numerical offset, never silently assume server local time.
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value))
    throw new BadRequestException("Timestamp must contain an explicit timezone offset");
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))throw new BadRequestException("Invalid timestamp");
  return d;
}
export function scheduleWindow(startAt:string,endAt:string,duration:number){
  const start=parseUtcInstant(startAt),end=parseUtcInstant(endAt);
  if(!Number.isInteger(duration)||duration<15||duration>720||
      end.getTime()-start.getTime()!==duration*60_000)
    throw new BadRequestException("Schedule must be 15–720 minutes with matching start, end and duration");
  return {start,end};
}
export function validTimeZone(zone:string):string{
  try{new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(new Date());return zone;}
  catch{throw new BadRequestException("Use a valid IANA timezone");}
}
export function validatedHours(hours:WorkingHour[]):WorkingHour[]{
  const copy=[...hours].sort((a,b)=>a.day-b.day||a.startMinute-b.startMinute);
  for(let i=0;i<copy.length;i++){
    const x=copy[i];
    if(!Number.isInteger(x.day)||x.day<0||x.day>6||
       !Number.isInteger(x.startMinute)||!Number.isInteger(x.endMinute)||
       x.startMinute<0||x.endMinute>1440||x.startMinute>=x.endMinute||
       (i>0&&copy[i-1].day===x.day&&copy[i-1].endMinute>x.startMinute))
      throw new BadRequestException("Weekly shifts must be nonoverlapping, nonovernight intervals");
  }
  return copy;
}
export function withinWorkingHours(start:Date,end:Date,zone:string,hours:WorkingHour[]):boolean{
  if(!hours.length)return true; // Backwards compatible: unconfigured shifts are unrestricted.
  const dateFmt=new Intl.DateTimeFormat("en-US",{timeZone:zone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const days:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const check=(instant:Date)=>{
    const parts=Object.fromEntries(dateFmt.formatToParts(instant).map(p=>[p.type,p.value]));
    const weekday=days[parts.weekday];const minute=Number(parts.hour)*60+Number(parts.minute);
    return hours.some(h=>h.day===weekday&&minute>=h.startMinute&&minute<h.endMinute);
  };
  // Max 720 checks; tests every local minute and handles DST transitions.
  for(let t=start.getTime();t<end.getTime();t+=60_000){if(!check(new Date(t)))return false;}
  return check(new Date(end.getTime()-1));
}
export function assertAvailableWindow(start:Date,end:Date,zone:string,hours:WorkingHour[]){
  if(!withinWorkingHours(start,end,zone,hours))throw new ConflictException("Outside technician working hours");
}
