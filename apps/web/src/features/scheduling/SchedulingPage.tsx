import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock3, ShieldCheck, Wrench } from "lucide-react";
import { Button, ErrorState } from "../../components/ui";
import { isDemo } from "../../services";
import { useMembership, useSession, useUi } from "../../state/store";
import { schedulingApi, type AvailabilityInput, type Shift, type TechnicianSchedule } from "./scheduling.api";

const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const time=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
const minute=(value:string)=>{const [h,m]=value.split(":").map(Number);return h*60+m;};
function useSave(org:string){
  const client=useQueryClient();
  const notify=useUi(s=>s.notify);
  const mutation=useMutation({
    mutationFn:async(fn:()=>Promise<unknown>)=>fn(),
    onSuccess:async()=>{await client.invalidateQueries({queryKey:["scheduling",org]});notify("Scheduling settings saved.");},
  });
  return mutation;
}
function AvailabilityEditor({item,org,own}:{item:TechnicianSchedule;org:string;own:boolean}){
  const [status,setStatus]=useState<AvailabilityInput["status"]>(item.declaredStatus);
  const [timeZone,setTimeZone]=useState(item.timeZone);
  const [weeklyHours,setHours]=useState<Shift[]>(item.weeklyHours);
  const [error,setError]=useState("");
  const api=schedulingApi(org),save=useSave(org);
  const add=()=>setHours(v=>[...v,{day:1,startMinute:540,endMinute:1020}]);
  const setHour=(i:number,part:keyof Shift,v:number)=>setHours(prev=>prev.map((h,j)=>i===j?{...h,[part]:v}:h));
  return (
    <section className="workflow-card workflow-form">
      <h2>Availability & working hours</h2>
      <p className="muted">Your working hours use the selected IANA timezone; bookings are stored as UTC instants. Empty weekly hours means no weekly restriction.</p>
      <label>Declared availability
        <select aria-label="Declared availability" value={status} onChange={e=>setStatus(e.target.value as AvailabilityInput["status"])}>
          <option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option><option value="OFF_DUTY">Off duty</option>
        </select>
      </label>
      <label>Timezone (IANA)
        <input aria-label="Timezone (IANA)" value={timeZone} maxLength={64} onChange={e=>setTimeZone(e.target.value)} placeholder="Asia/Damascus"/>
      </label>
      <div className="workflow-form">
        <h3>Weekly shifts</h3>
        {weeklyHours.map((shift,i)=>(
          <div className="schedule-shift" key={i}>
            <label>Day {i+1}
              <select aria-label={`Shift ${i+1} day`} value={shift.day} onChange={e=>setHour(i,"day",Number(e.target.value))}>
                {days.map((d,j)=><option key={d} value={j}>{d}</option>)}
              </select>
            </label>
            <label>Start<input aria-label={`Shift ${i+1} start`} type="time" value={time(shift.startMinute)} onChange={e=>setHour(i,"startMinute",minute(e.target.value))}/></label>
            <label>End<input aria-label={`Shift ${i+1} end`} type="time" value={time(shift.endMinute===1440?1439:shift.endMinute)} onChange={e=>setHour(i,"endMinute",minute(e.target.value))}/></label>
            <Button variant="secondary" type="button" onClick={()=>setHours(v=>v.filter((_,j)=>i!==j))}>Remove shift</Button>
          </div>
        ))}
        <Button variant="secondary" type="button" disabled={weeklyHours.length>=28} onClick={add}>Add weekly shift</Button>
      </div>
      {error&&<p role="alert" className="schedule-conflict">{error}</p>}
      <Button busy={save.isPending} onClick={()=>{
        setError("");
        const data={status,timeZone,weeklyHours};
        save.mutate(()=>own?api.updateMine(data):api.updateTechnician(item.id,data),
          {onError:e=>setError(e.message)});
      }}>Save availability</Button>
    </section>
  );
}
function TimeOffEditor({item,org,own}:{item:TechnicianSchedule;org:string;own:boolean}){
  const [start,setStart]=useState(""),[end,setEnd]=useState(""),[reason,setReason]=useState("");
  const [error,setError]=useState("");
  const api=schedulingApi(org),save=useSave(org);
  const submit=()=>{
    setError("");
    if(!start||!end||new Date(end)<=new Date(start)){setError("End must be later than start.");return;}
    save.mutate(()=>api.timeOff({startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),reason},own?undefined:item.id),
      {onSuccess:()=>{setStart("");setEnd("");setReason("");},onError:e=>setError(e.message)});
  };
  return (
    <section className="workflow-card workflow-form">
      <h2>Time off</h2>
      <p className="muted">Time off cannot overlap an active scheduled assignment.</p>
      {item.timeOff.map(t=><div className="schedule-time-off" key={t.id}>
        <span>{new Date(t.startAt).toLocaleString()} – {new Date(t.endAt).toLocaleString()} {t.reason&&`· ${t.reason}`}</span>
        <Button variant="secondary" busy={save.isPending} onClick={()=>save.mutate(()=>api.removeTimeOff(t.id,!own),{onError:e=>setError(e.message)})}>Remove</Button>
      </div>)}
      <div className="schedule-datetime-row">
        <label>Time off start<input aria-label="Time off start" type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label>Time off end<input aria-label="Time off end" type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      </div>
      <label>Reason (optional)<input maxLength={200} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {error&&<p role="alert" className="schedule-conflict">{error}</p>}
      <Button busy={save.isPending} onClick={submit}>Add time off</Button>
    </section>
  );
}
function SkillManager({item,org}:{item:TechnicianSchedule;org:string}){
  const api=schedulingApi(org);
  const skills=useQuery({queryKey:["scheduling",org,"skills"],queryFn:({signal})=>api.skills(signal)});
  const [selected,setSelected]=useState<string[]>(item.skills.map(s=>s.id));
  const [newSkill,setNewSkill]=useState("");
  const [error,setError]=useState("");
  const save=useSave(org);
  return <section className="workflow-card workflow-form">
    <h2>Technician skills</h2>
    <div className="schedule-skill-list">{skills.data?.map(skill=><label key={skill.id} className="sharing-consent">
      <input type="checkbox" checked={selected.includes(skill.id)}
        onChange={e=>setSelected(a=>e.target.checked?[...a,skill.id]:a.filter(x=>x!==skill.id))}/>
      {skill.name}
    </label>)}</div>
    {skills.isError&&<p role="alert">Cannot load skill catalog.</p>}
    <Button busy={save.isPending} disabled={skills.isPending} onClick={()=>save.mutate(()=>api.technicianSkills(item.id,selected),{onError:e=>setError(e.message)})}>Save technician skills</Button>
    <label>New organization skill<input minLength={2} maxLength={80} value={newSkill} onChange={e=>setNewSkill(e.target.value)}/></label>
    <Button variant="secondary" busy={save.isPending} disabled={newSkill.trim().length<2}
      onClick={()=>save.mutate(()=>api.createSkill(newSkill),{onSuccess:()=>setNewSkill(""),onError:e=>setError(e.message)})}>Create skill</Button>
    {error&&<p role="alert" className="schedule-conflict">{error}</p>}
  </section>;
}
export function SchedulingPage(){
  const org=useSession(s=>s.organizationId);
  const role=useMembership()?.role.name;
  const staff=role==="ADMIN"||role==="DISPATCHER";
  const tech=role==="TECHNICIAN";
  const [selected,setSelected]=useState("");
  const api=schedulingApi(org);
  const q=useQuery({queryKey:["scheduling",org,staff?"all":"mine"],
    queryFn:async({signal}):Promise<TechnicianSchedule[]>=>staff?api.technicians(signal):[await api.mine(signal)],
    enabled:!isDemo&&(staff||tech)&&!!org});
  if(isDemo||(!staff&&!tech))return <section className="workflow-card">Scheduling is available only to authorized staff.</section>;
  if(q.isPending)return <p role="status">Loading scheduling information…</p>;
  if(q.isError)return <ErrorState retry={()=>void q.refetch()}/>;
  const records=q.data;
  const item=records.find(t=>t.id===selected)??records[0];
  const editable=tech||role==="ADMIN";
  return <div className="workflow-page schedule-page">
    <header className="workflow-heading"><div>
      <p className="eyebrow"><CalendarClock size={14} aria-hidden="true"/> FIELDOPS / SCHEDULING</p>
      <h1>Technician availability</h1>
      <p className="muted">Plan work around shifts, time off, skills and existing assignments.</p>
    </div><Button variant="secondary" onClick={()=>void q.refetch()}>Refresh schedule</Button></header>
    {staff&&<section className="workflow-card workflow-form">
      <h2>Technician directory</h2>
      <label>Select technician
        <select aria-label="Select technician" value={item?.id??""} onChange={e=>setSelected(e.target.value)}>
          {records.map(t=><option key={t.id} value={t.id}>{t.name} · {t.employeeCode}</option>)}
        </select>
      </label>
      <p className="muted">Directory access is restricted to Admin and Dispatcher. Only Admin can edit other technicians.</p>
    </section>}
    {!item?<section className="workflow-card">No active technicians.</section>:<div key={item.id}>
      <section className="schedule-summary">
        <article className="workflow-card"><ShieldCheck size={19}/><strong>{item.name}</strong><small>Current status: {item.status.replace("_"," ")}</small></article>
        <article className="workflow-card"><Clock3 size={19}/><strong>{item.timeZone}</strong><small>{item.weeklyHours.length} configured shifts</small></article>
        <article className="workflow-card"><Wrench size={19}/><strong>{item.skills.length} skills</strong><small>{item.assignments.length} active assignments</small></article>
      </section>
      <section className="workflow-card">
        <h2>Current assignments</h2>
        {!item.assignments.length?<p className="muted">No active assignments.</p>:
          item.assignments.map((a,i)=><p key={i}>{a.workOrder.title} · {a.workOrder.status.replace("_"," ")}
            {a.workOrder.scheduledAt&&<> · {new Date(a.workOrder.scheduledAt).toLocaleString()}</>}</p>)}
      </section>
      {editable?<div className="schedule-editor-grid">
        <AvailabilityEditor item={item} org={org} own={tech}/>
        <TimeOffEditor item={item} org={org} own={tech}/>
        {role==="ADMIN"&&<SkillManager item={item} org={org}/>}
      </div>:<section className="workflow-card">
        <h2>Availability details</h2>
        <p>{item.declaredStatus.replace("_"," ")} · {item.weeklyHours.length} weekly shifts · {item.timeOff.length} time-off periods</p>
        <p>Skills: {item.skills.map(s=>s.name).join(", ")||"None configured"}</p>
      </section>}
    </div>}
  </div>;
}
