import { describe,expect,it } from "vitest";
import { buildSchedule,toLocalDateTime } from "./OrderScheduleEditor";
describe("Stage 6B browser schedule input",()=>{
  it("converts a local datetime to UTC instants and exact duration",()=>{
    const result=buildSchedule("2026-10-27T10:15",75,3);
    expect(new Date(result.plannedEndAt).getTime()-new Date(result.plannedStartAt).getTime()).toBe(75*60000);
    expect(result.estimatedDurationMinutes).toBe(75);
    expect(result.expectedVersion).toBe(3);
    expect(result.plannedStartAt.endsWith("Z")).toBe(true);
  });
  it("rejects missing start, invalid and negative duration",()=>{
    expect(()=>buildSchedule("",60,0)).toThrow();
    expect(()=>buildSchedule("2026-10-27T10:15",0,0)).toThrow();
    expect(()=>buildSchedule("2026-10-27T10:15",721,0)).toThrow();
  });
  it("retains existing schedule in the viewer timezone",()=>{
    const dt="2026-11-02T10:00:00.000Z";
    expect(new Date(toLocalDateTime(dt)).getTime()).toBe(new Date(dt).getTime());
    expect(toLocalDateTime(null)).toBe("");
  });
});
