import { z } from "zod";
import { http } from "../../services/http";
import { orgPath } from "../../services/workflow";

export const skill=z.object({id:z.string().uuid(),name:z.string()});
const shift=z.object({day:z.number(),startMinute:z.number(),endMinute:z.number()});
export type Shift=z.infer<typeof shift>;
const timeOff=z.object({id:z.string().uuid(),startAt:z.string(),endAt:z.string(),reason:z.string().nullable()});
export const technicianSchedule=z.object({
  id:z.string().uuid(),employeeCode:z.string(),name:z.string(),timeZone:z.string(),
  status:z.enum(["AVAILABLE","UNAVAILABLE","OFF_DUTY","BUSY"]),
  declaredStatus:z.enum(["AVAILABLE","UNAVAILABLE","OFF_DUTY"]),
  weeklyHours:z.array(shift),timeOff:z.array(timeOff),skills:z.array(skill),
  assignments:z.array(z.object({workOrder:z.object({
    title:z.string(),status:z.string(),scheduledAt:z.string().nullable(),plannedEndAt:z.string().nullable()
  })})),
});
export type TechnicianSchedule=z.infer<typeof technicianSchedule>;
export type AvailabilityInput={status:"AVAILABLE"|"UNAVAILABLE"|"OFF_DUTY";timeZone:string;weeklyHours:Shift[]};
const base=(org:string)=>`${orgPath(org)}/scheduling`;
export const schedulingApi=(org:string)=>({
  technicians:(signal?:AbortSignal)=>http(`${base(org)}/technicians`,z.array(technicianSchedule),{signal}),
  mine:(signal?:AbortSignal)=>http(`${base(org)}/me`,technicianSchedule,{signal}),
  skills:(signal?:AbortSignal)=>http(`${base(org)}/skills`,z.array(skill),{signal}),
  updateMine:(data:AvailabilityInput)=>http(`${base(org)}/me/availability`,z.unknown(),{method:"PUT",body:JSON.stringify(data)}),
  updateTechnician:(id:string,data:AvailabilityInput)=>http(`${base(org)}/technicians/${id}/availability`,z.unknown(),{method:"PUT",body:JSON.stringify(data)}),
  timeOff:(data:{startAt:string;endAt:string;reason?:string},id?:string)=>http(
    `${base(org)}/${id?`technicians/${id}`:"me"}/time-off`,timeOff,{method:"POST",body:JSON.stringify(data)}
  ),
  removeTimeOff:(id:string,admin:boolean)=>http(`${base(org)}/${admin?"time-off":"me/time-off"}/${id}`,z.void(),{method:"DELETE"}),
  createSkill:(name:string)=>http(`${base(org)}/skills`,skill,{method:"POST",body:JSON.stringify({name})}),
  technicianSkills:(id:string,skillIds:string[])=>http(`${base(org)}/technicians/${id}/skills`,
    z.object({technicianId:z.string().uuid()}),{method:"PUT",body:JSON.stringify({skillIds})}),
  orderSkills:(id:string,skillIds:string[],expectedVersion:number)=>http(`${base(org)}/work-orders/${id}/skills`,
    z.object({id:z.string().uuid(),version:z.number()}),{method:"PUT",body:JSON.stringify({skillIds,expectedVersion})}),
  schedule:(id:string,data:{plannedStartAt:string;plannedEndAt:string;estimatedDurationMinutes:number;expectedVersion:number})=>
    http(`${base(org)}/work-orders/${id}/schedule`,z.object({id:z.string().uuid(),version:z.number()}),
      {method:"PATCH",body:JSON.stringify(data)}),
});
