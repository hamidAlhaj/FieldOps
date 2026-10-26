import { BadRequestException, ConflictException } from "@nestjs/common";
import { assertAvailableWindow, parseUtcInstant, scheduleWindow, validatedHours, validTimeZone, withinWorkingHours } from "../src/scheduling/scheduling.policy";
describe("Stage 6B schedule validation",()=>{
  it("requires explicitly zoned RFC3339 timestamps and exact durations",()=>{
    expect(parseUtcInstant("2026-10-27T11:00:00+03:00").toISOString()).toBe("2026-10-27T08:00:00.000Z");
    expect(()=>parseUtcInstant("2026-10-27T11:00:00")).toThrow(BadRequestException);
    expect(()=>scheduleWindow("2026-10-27T09:00:00Z","2026-10-27T10:15:00Z",60)).toThrow();
    expect(scheduleWindow("2026-10-27T09:00:00Z","2026-10-27T10:15:00Z",75).start.toISOString()).toBe("2026-10-27T09:00:00.000Z");
  });
  it("rejects invalid IANA time zones and overlapping local shifts",()=>{
    expect(validTimeZone("Asia/Damascus")).toBe("Asia/Damascus");
    expect(()=>validTimeZone("Fake/Zone")).toThrow(BadRequestException);
    expect(()=>validatedHours([{day:1,startMinute:540,endMinute:720},{day:1,startMinute:700,endMinute:800}])).toThrow();
    expect(()=>validatedHours([{day:1,startMinute:900,endMinute:540}])).toThrow();
  });
  it("handles local working hours and boundaries",()=>{
    const h=[{day:1,startMinute:540,endMinute:1020}];
    expect(withinWorkingHours(new Date("2026-10-26T09:00:00Z"),new Date("2026-10-26T10:00:00Z"),"UTC",h)).toBe(true);
    expect(withinWorkingHours(new Date("2026-10-26T08:59:00Z"),new Date("2026-10-26T10:00:00Z"),"UTC",h)).toBe(false);
    expect(()=>assertAvailableWindow(new Date("2026-10-26T16:30:00Z"),new Date("2026-10-26T17:30:00Z"),"UTC",h)).toThrow(ConflictException);
    expect(withinWorkingHours(new Date("2026-10-26T16:00:00Z"),new Date("2026-10-26T17:00:00Z"),"UTC",h)).toBe(true);
  });
  it("compares actual instants across daylight-saving changes",()=>{
    const h=Array.from({length:7},(_,day)=>({day,startMinute:0,endMinute:1440}));
    expect(withinWorkingHours(new Date("2026-11-01T08:00:00Z"),new Date("2026-11-01T10:00:00Z"),"America/Los_Angeles",h)).toBe(true);
  });
});
