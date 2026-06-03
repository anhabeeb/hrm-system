const baseUrl = (process.argv[2] ?? "https://hrm.cafeasiana.com.mv").replace(/\/+$/, "");

const checks = [
  { path: "/api/v1/health", expectedStatus: 200, label: "health" },
  { path: "/api/v1/users", expectedStatus: 401, label: "users unauthenticated" },
  { path: "/api/v1/roles", expectedStatus: 401, label: "roles unauthenticated" },
  { path: "/api/v1/permissions", expectedStatus: 401, label: "permissions unauthenticated" },
];

let failed = false;

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  const ok = response.status === check.expectedStatus && contentType.includes("application/json");
  console.log(`${ok ? "OK" : "FAIL"} ${check.label}: ${response.status} ${contentType} ${url}`);

  if (!ok) {
    failed = true;
    console.log(text.slice(0, 800));
  }
}

if (failed) {
  process.exitCode = 1;
}
