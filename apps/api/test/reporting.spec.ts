import { reportingRange } from "../src/reporting/reporting.module";
it("uses a half-open UTC range with a bounded default", () => {
  const now = new Date("2026-10-26T00:00:00Z");
  const r = reportingRange({}, now);
  expect(r.to).toEqual(now);
  expect(+r.to - +r.from).toBe(30 * 86400000);
});
it.each([
  { from: "bad" },
  { from: "2026-10-25T00:00:00", to: "2026-10-26T00:00:00Z" },
  { from: "2026-10-26T00:00:00Z", to: "2026-10-25T00:00:00Z" },
  { from: "2020-01-01T00:00:00Z", to: "2026-10-25T00:00:00Z" },
])("rejects invalid, ambiguous and unbounded ranges %j", (dto) => {
  expect(() => reportingRange(dto)).toThrow();
});
