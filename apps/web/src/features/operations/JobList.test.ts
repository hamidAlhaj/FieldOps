import { expect, it } from "vitest";
import { filterJobs } from "./JobList";
import { demoJobs } from "../../services/mocks/data";
it("combines case-insensitive search with status rather than ignoring either filter", () => {
  expect(
    filterJobs(demoJobs, " WESTSIDE ", "ASSIGNED").map((j) => j.id),
  ).toEqual(["1044"]);
  expect(filterJobs(demoJobs, "missing", "ALL")).toEqual([]);
});
