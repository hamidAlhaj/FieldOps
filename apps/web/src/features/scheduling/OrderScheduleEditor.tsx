import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui";
import { useSession, useUi } from "../../state/store";
import { schedulingApi } from "./scheduling.api";

export function toLocalDateTime(value:string|null){
  if(!value)return "";
  const d=new Date(value);
  return new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}
export function buildSchedule(local:string,duration:number,expectedVersion:number){
  const start=new Date(local);
  if(!local||!Number.isFinite(start.getTime())||!Number.isInteger(duration)||duration<15||duration>720)
    throw new Error("Choose a valid start time and duration of 15–720 minutes.");
  const end=new Date(start.getTime()+duration*60_000);
  return {plannedStartAt:start.toISOString(),plannedEndAt:end.toISOString(),estimatedDurationMinutes:duration,expectedVersion};
}
export function OrderScheduleEditor({
  id,version,scheduledAt,plannedEndAt,estimatedDurationMinutes,requiredSkills,
}:{
  id:string;version:number;scheduledAt:string|null;plannedEndAt:string|null;
  estimatedDurationMinutes:number|null;requiredSkills:{skillId:string;skill:{id:string;name:string}}[];
}){
  const org=useSession(s=>s.organizationId),cache=useQueryClient();
  const notify=useUi(s=>s.notify);
  const api=schedulingApi(org);
  const [start,setStart]=useState(toLocalDateTime(scheduledAt));
  const [duration,setDuration]=useState(estimatedDurationMinutes??60);
  const [selected,setSelected]=useState(requiredSkills.map(x=>x.skillId));
  const [error,setError]=useState("");
  const skills=useQuery({queryKey:["scheduling",org,"skills"],queryFn:({signal})=>api.skills(signal)});
  const save=useMutation({
    mutationFn:async(kind:"schedule"|"skills")=>{
      if(kind==="skills")return api.orderSkills(id,selected,version);
      return api.schedule(id,buildSchedule(start,duration,version));
    },
    onSuccess:async()=>{
      setError("");await cache.invalidateQueries({queryKey:["order",org,id]});
      await cache.invalidateQueries({queryKey:["scheduling",org]});
      notify("Work order scheduling updated.");
    },
    onError:async(err:Error)=>{
      setError(err.message);
      await cache.invalidateQueries({queryKey:["order",org,id]});
    }
  });
  let endLabel="";
  try{if(start&&Number.isFinite(new Date(start).getTime()))endLabel=new Date(new Date(start).getTime()+duration*60_000).toLocaleString();}catch{/* Show invalid form feedback on submit */}
  return <section className="workflow-card workflow-form">
    <h2><CalendarClock size={18} aria-hidden="true"/> Work order schedule</h2>
    <p className="muted">Choose your local start time. The API receives timezone-safe UTC instants. An active technician must be available, on shift and free of overlapping reservations.</p>
    <div className="schedule-datetime-row">
      <label>Planned start
        <input aria-label="Planned start" type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/>
      </label>
      <label>Estimated duration (minutes)
        <input aria-label="Estimated duration (minutes)" type="number" min={15} max={720} step={15} value={duration} onChange={e=>setDuration(e.target.valueAsNumber)}/>
      </label>
    </div>
    <p className="muted">Planned end: <strong>{endLabel||"Choose a valid start and duration"}</strong></p>
    <Button busy={save.isPending} disabled={!start||!endLabel} onClick={()=>save.mutate("schedule")}>Save planned schedule</Button>
    <h3>Required skills</h3>
    <p className="muted">Assignments require every selected skill. Only administrators create or grant skills.</p>
    <div className="schedule-skill-list">
      {skills.data?.map(skill=><label key={skill.id} className="sharing-consent">
        <input type="checkbox" checked={selected.includes(skill.id)}
          onChange={e=>setSelected(old=>e.target.checked?[...old,skill.id]:old.filter(s=>s!==skill.id))}/>
        {skill.name}
      </label>)}
    </div>
    {!skills.isPending&&!skills.data?.length&&<p className="muted">No skills have been configured by an administrator.</p>}
    {skills.isError&&<p role="alert">Could not load the organization skill catalog.</p>}
    <Button variant="secondary" disabled={skills.isPending} busy={save.isPending} onClick={()=>save.mutate("skills")}>Save required skills</Button>
    {error&&<p role="alert" className="schedule-conflict"><ShieldAlert size={16} aria-hidden="true"/>{error} Reload the work order and choose a new time if needed.</p>}
    <p className="muted">Saving a schedule or required skills increments this work order's version. Existing assignment history is preserved.</p>
  </section>;
}
