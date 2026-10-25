import { Job, Role, User } from "../contracts";
export const demoUser = (role: Role): User => ({
  id: role === "TECHNICIAN" ? "lina" : role === "CUSTOMER" ? "clinic" : "sam",
  displayName:
    role === "TECHNICIAN"
      ? "Lina Haddad"
      : role === "CUSTOMER"
        ? "Alex Morgan"
        : "Sam Mitchell",
  email: "preview@example.test",
  memberships: [
    {
      id: "demo-membership",
      organizationId: "demo-organization",
      role: { name: role },
    },
  ],
});
const items: [
  string,
  string,
  string,
  Job["status"],
  Job["priority"],
  string,
  string,
][] = [
  [
    "1048",
    "HVAC system inspection",
    "Westside Medical Center",
    "IN_PROGRESS",
    "HIGH",
    "Lina Haddad",
    "clinic",
  ],
  [
    "1047",
    "Electrical panel maintenance",
    "The Foundry · Building B",
    "ASSIGNED",
    "URGENT",
    "Omar Saleh",
    "foundry",
  ],
  [
    "1046",
    "Water pump replacement",
    "Riverside Apartments",
    "OPEN",
    "MEDIUM",
    "Unassigned",
    "riverside",
  ],
  [
    "1045",
    "Elevator safety check",
    "Northgate Office Park",
    "COMPLETED",
    "HIGH",
    "Maya Chen",
    "northgate",
  ],
  [
    "1044",
    "Cooling unit calibration",
    "Westside Medical Center",
    "ASSIGNED",
    "MEDIUM",
    "Lina Haddad",
    "clinic",
  ],
  [
    "1043",
    "Emergency lighting repair",
    "The Foundry · Building A",
    "VERIFIED",
    "LOW",
    "Omar Saleh",
    "foundry",
  ],
  [
    "1042",
    "Ventilation filter service",
    "Riverside Apartments",
    "OPEN",
    "LOW",
    "Unassigned",
    "riverside",
  ],
  [
    "1041",
    "Fire alarm inspection",
    "Westside Medical Center",
    "CLOSED",
    "HIGH",
    "Maya Chen",
    "clinic",
  ],
  [
    "1040",
    "Generator routine service",
    "Northgate Office Park",
    "ASSIGNED",
    "MEDIUM",
    "Omar Saleh",
    "northgate",
  ],
  [
    "1039",
    "Roof drainage assessment",
    "Riverside Apartments",
    "CANCELLED",
    "LOW",
    "Maya Chen",
    "riverside",
  ],
  [
    "1038",
    "Temperature sensor replacement",
    "Westside Medical Center",
    "IN_PROGRESS",
    "MEDIUM",
    "Lina Haddad",
    "clinic",
  ],
  [
    "1037",
    "Access control maintenance",
    "The Foundry · Building B",
    "OPEN",
    "HIGH",
    "Unassigned",
    "foundry",
  ],
];
export const demoJobs: Job[] = items.map(
  ([n, title, address, status, priority, technician, customerId], i) => ({
    id: n,
    reference: `WO-${n}`,
    title,
    address,
    status,
    priority,
    technician,
    customerId,
    description:
      "Inspect the equipment, record the findings, and complete all safety checks. Coordinate access with the site reception before arrival.",
    scheduledAt: `2026-10-25T${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00`,
    createdAt: "2026-10-24T09:00:00Z",
  }),
);
export const demoTeam = [
  ["LH", "Lina Haddad", "On site", "purple"],
  ["OS", "Omar Saleh", "Assigned", "amber"],
  ["MC", "Maya Chen", "Available", "green"],
];
export const demoNotifications = [
  ["Job completed", "Maya finished the Northgate safety check.", "12 min ago"],
  [
    "Assignment updated",
    "Lina is heading to Westside Medical Center.",
    "38 min ago",
  ],
  ["Request received", "New inspection request from Riverside.", "1 hour ago"],
];
