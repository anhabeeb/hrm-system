const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY"
};

const ROLE_LEVELS = {
  EMPLOYEE: 10,
  ACCOUNTANT: 30,
  MANAGER: 40,
  HR: 50,
  ADMIN: 90,
  SUPERADMIN: 100
};

const API_ROLES = {
  settings: ["SUPERADMIN", "ADMIN"],
  employees: ["SUPERADMIN", "ADMIN", "HR", "MANAGER"],
  attendance: ["SUPERADMIN", "ADMIN", "HR", "MANAGER"],
  payroll: ["SUPERADMIN", "ADMIN", "ACCOUNTANT", "HR"],
  biometric: ["SUPERADMIN", "ADMIN", "HR"]
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, ctx, url);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return htmlResponse("HRM System Worker is running. Static assets are not configured.");
    } catch (error) {
      console.error(error);
      return json({ error: error?.status ? error.message : "Internal server error", details: error?.status ? undefined : (error?.message || String(error)) }, error?.status || 500, request);
    }
  }
};

async function handleApi(request, env, ctx, url) {
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (pathname === "/api/health" && method === "GET") {
    const dbCheck = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: true, app: env.APP_NAME || "HRM System", db: dbCheck?.ok === 1, now: new Date().toISOString() }, 200, request);
  }

  if (pathname === "/api/setup/status" && method === "GET") {
    const count = await scalar(env.DB, "SELECT COUNT(*) FROM users");
    return json({ setupRequired: Number(count) === 0 }, 200, request);
  }

  if (pathname === "/api/setup/complete" && method === "POST") {
    return completeSetup(request, env);
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    return login(request, env);
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    const session = await requireSession(request, env);
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(session.id).run();
    return json({ ok: true }, 200, request, clearSessionCookie());
  }

  const session = await requireSession(request, env);

  if (pathname === "/api/auth/me" && method === "GET") {
    const effectiveApprovalRequired = await getEffectiveApprovalRequirement(env);
    return json({ user: publicUser(session.user), effectiveApprovalRequired }, 200, request);
  }

  if (pathname === "/api/auth/2fa/setup" && method === "POST") {
    const secret = base32Random(20);
    await env.DB.prepare("UPDATE users SET totp_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(secret, session.user.id).run();
    await audit(env, session.user.id, "2FA_SETUP_STARTED", "users", session.user.id, {});
    const issuer = encodeURIComponent(env.APP_NAME || "HRM System");
    const label = encodeURIComponent(`${env.APP_NAME || "HRM System"}:${session.user.email}`);
    return json({ secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` }, 200, request);
  }

  if (pathname === "/api/auth/2fa/enable" && method === "POST") {
    const body = await readJson(request);
    const code = String(body.code || "").trim();
    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(session.user.id).first();
    if (!user?.totp_secret) return json({ error: "Start 2FA setup first." }, 400, request);
    if (!(await verifyTotp(user.totp_secret, code))) return json({ error: "Invalid authentication code." }, 400, request);
    await env.DB.prepare("UPDATE users SET totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.user.id).run();
    await audit(env, session.user.id, "2FA_ENABLED", "users", session.user.id, {});
    return json({ ok: true }, 200, request);
  }

  if (pathname === "/api/auth/2fa/disable" && method === "POST") {
    const body = await readJson(request);
    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(session.user.id).first();
    const okPassword = await verifyPassword(String(body.password || ""), user.password_hash);
    if (!okPassword) return json({ error: "Password confirmation failed." }, 400, request);
    await env.DB.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.user.id).run();
    await audit(env, session.user.id, "2FA_DISABLED", "users", session.user.id, {});
    return json({ ok: true }, 200, request);
  }

  if (pathname === "/api/dashboard" && method === "GET") {
    return dashboard(env, request);
  }

  if (pathname === "/api/settings" && method === "GET") {
    assertRole(session.user, API_ROLES.settings);
    return getSettings(env, request);
  }

  if (pathname === "/api/settings" && method === "PUT") {
    assertRole(session.user, API_ROLES.settings);
    return updateSettings(request, env, session.user);
  }

  if (pathname === "/api/departments" && method === "GET") {
    assertRole(session.user, API_ROLES.employees);
    return listDepartments(env, request);
  }

  if (pathname === "/api/departments" && method === "POST") {
    assertRole(session.user, ["SUPERADMIN", "ADMIN", "HR"]);
    return createDepartment(request, env, session.user);
  }

  if (pathname === "/api/stores" && method === "GET") {
    assertRole(session.user, API_ROLES.employees);
    return listStores(env, request);
  }

  if (pathname === "/api/stores" && method === "POST") {
    assertRole(session.user, ["SUPERADMIN", "ADMIN", "HR"]);
    return createStore(request, env, session.user);
  }

  if (pathname === "/api/employees" && method === "GET") {
    assertRole(session.user, API_ROLES.employees);
    return listEmployees(env, request, url);
  }

  if (pathname === "/api/employees" && method === "POST") {
    assertRole(session.user, ["SUPERADMIN", "ADMIN", "HR"]);
    return createEmployee(request, env, session.user);
  }

  const employeeMatch = pathname.match(/^\/api\/employees\/([^/]+)$/);
  if (employeeMatch && method === "PUT") {
    assertRole(session.user, ["SUPERADMIN", "ADMIN", "HR"]);
    return updateEmployee(employeeMatch[1], request, env, session.user);
  }

  if (pathname === "/api/attendance" && method === "GET") {
    assertRole(session.user, API_ROLES.attendance);
    return listAttendance(env, request, url);
  }

  if (pathname === "/api/attendance" && method === "POST") {
    assertRole(session.user, API_ROLES.attendance);
    return upsertAttendance(request, env, session.user);
  }

  if (pathname === "/api/advances" && method === "GET") {
    assertRole(session.user, API_ROLES.payroll);
    return listAdvances(env, request, url);
  }

  if (pathname === "/api/advances" && method === "POST") {
    assertRole(session.user, API_ROLES.payroll);
    return createAdvance(request, env, session.user);
  }

  if (pathname === "/api/payroll/preview" && method === "GET") {
    assertRole(session.user, API_ROLES.payroll);
    return payrollPreview(env, request, url);
  }

  if (pathname === "/api/biometric/devices" && method === "GET") {
    assertRole(session.user, API_ROLES.biometric);
    return listBiometricDevices(env, request);
  }

  if (pathname === "/api/biometric/devices" && method === "POST") {
    assertRole(session.user, API_ROLES.biometric);
    return createBiometricDevice(request, env, session.user);
  }

  if (pathname === "/api/biometric/push" && method === "POST") {
    return biometricPush(request, env);
  }

  return json({ error: "Not found" }, 404, request);
}

async function completeSetup(request, env) {
  const existing = Number(await scalar(env.DB, "SELECT COUNT(*) FROM users"));
  if (existing > 0) return json({ error: "Setup has already been completed." }, 409, request);

  const body = await readJson(request);
  const companyName = clean(body.companyName, 2, 120);
  const fullName = clean(body.fullName, 2, 120);
  const email = cleanEmail(body.email);
  const password = String(body.password || "");

  if (!companyName || !fullName || !email || password.length < 10) {
    return json({ error: "Company name, full name, valid email, and a password of at least 10 characters are required." }, 400, request);
  }

  const companyId = id("company");
  const userId = id("user");
  const employeeId = id("emp");
  const passwordHash = await hashPassword(password);

  await env.DB.prepare("INSERT INTO companies (id, name) VALUES (?, ?)").bind(companyId, companyName).run();
  await env.DB.prepare("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'SUPERADMIN')")
    .bind(userId, fullName, email, passwordHash).run();
  await env.DB.prepare(`INSERT INTO employee_profiles
    (id, user_id, employee_code, full_name, email, department_id, store_id, job_title, hire_date, salary_type, base_salary)
    VALUES (?, ?, ?, ?, ?, 'dept-admin', 'store-main', 'Super Administrator', date('now'), 'MONTHLY', 0)`)
    .bind(employeeId, userId, "EMP-0001", fullName, email).run();
  await audit(env, userId, "SETUP_COMPLETED", "companies", companyId, { companyName });

  const loginResponse = await createSessionResponse(request, env, { id: userId, full_name: fullName, email, role: "SUPERADMIN", status: "ACTIVE", totp_enabled: 0 });
  return json({ ok: true, user: publicUser(loginResponse.user) }, 201, request, loginResponse.cookie);
}

async function login(request, env) {
  const body = await readJson(request);
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  const totpCode = String(body.totpCode || "").trim();

  const user = await env.DB.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").bind(email).first();
  if (!user || user.status !== "ACTIVE") return json({ error: "Invalid email or password." }, 401, request);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: "Invalid email or password." }, 401, request);

  if (Number(user.totp_enabled) === 1) {
    if (!totpCode) return json({ requires2fa: true, message: "Enter your Google Authenticator code." }, 200, request);
    if (!(await verifyTotp(user.totp_secret, totpCode))) return json({ error: "Invalid authentication code." }, 401, request);
  }

  await env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
  await audit(env, user.id, "LOGIN", "users", user.id, {});
  const session = await createSessionResponse(request, env, user);
  return json({ ok: true, user: publicUser(user) }, 200, request, session.cookie);
}

async function createSessionResponse(request, env, user) {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const sessionId = id("session");
  const days = Math.max(1, Number(env.SESSION_DAYS || 7));
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const ua = request.headers.get("user-agent") || "";
  const ipHint = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";

  await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hint) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(sessionId, user.id, tokenHash, expires, ua.slice(0, 250), ipHint.slice(0, 80)).run();

  return { user, cookie: sessionCookie(token, days) };
}

async function requireSession(request, env) {
  const token = getCookie(request, "hrm_session");
  if (!token) throw httpError(401, "Authentication required.");
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT s.id AS session_id, s.expires_at, u.*
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.status = 'ACTIVE'`)
    .bind(tokenHash).first();

  if (!row) throw httpError(401, "Session expired. Please log in again.");
  await env.DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.session_id).run();
  return { id: row.session_id, user: row };
}

async function dashboard(env, request) {
  const [employees, departments, presentToday, pendingLeave, pendingApprovals] = await Promise.all([
    scalar(env.DB, "SELECT COUNT(*) FROM employee_profiles WHERE employment_status = 'ACTIVE'"),
    scalar(env.DB, "SELECT COUNT(*) FROM departments WHERE is_active = 1"),
    scalar(env.DB, "SELECT COUNT(*) FROM attendance_records WHERE work_date = date('now') AND status = 'PRESENT'"),
    scalar(env.DB, "SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING'"),
    scalar(env.DB, "SELECT COUNT(*) FROM approval_requests WHERE status = 'PENDING'")
  ]);
  return json({ employees, departments, presentToday, pendingLeave, pendingApprovals }, 200, request);
}

async function getSettings(env, request) {
  const rows = await env.DB.prepare("SELECT key, value, updated_at FROM app_settings ORDER BY key").all();
  const settings = Object.fromEntries(rows.results.map((r) => [r.key, parseSetting(r.value)]));
  settings.effectiveApprovalRequired = await getEffectiveApprovalRequirement(env);
  return json({ settings }, 200, request);
}

async function updateSettings(request, env, user) {
  const body = await readJson(request);
  const allowed = ["approval_requests_enabled", "overtime_enabled", "benefits_enabled", "long_leave_deduction_mode", "biometric_integration_enabled"];
  for (const key of allowed) {
    if (key in body) {
      const value = typeof body[key] === "boolean" ? String(body[key]) : String(body[key]);
      await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
        .bind(key, value).run();
    }
  }
  await audit(env, user.id, "SETTINGS_UPDATED", "app_settings", null, body);
  return getSettings(env, request);
}

async function listDepartments(env, request) {
  const rows = await env.DB.prepare("SELECT * FROM departments ORDER BY name").all();
  return json({ departments: rows.results }, 200, request);
}

async function createDepartment(request, env, user) {
  const body = await readJson(request);
  const name = clean(body.name, 2, 100);
  if (!name) return json({ error: "Department name is required." }, 400, request);
  const department = { id: id("dept"), name, description: clean(body.description, 0, 300) || null };
  await env.DB.prepare("INSERT INTO departments (id, name, description) VALUES (?, ?, ?)").bind(department.id, department.name, department.description).run();
  await audit(env, user.id, "DEPARTMENT_CREATED", "departments", department.id, department);
  return json({ department }, 201, request);
}

async function listStores(env, request) {
  const rows = await env.DB.prepare("SELECT * FROM stores ORDER BY name").all();
  return json({ stores: rows.results }, 200, request);
}

async function createStore(request, env, user) {
  const body = await readJson(request);
  const name = clean(body.name, 2, 100);
  if (!name) return json({ error: "Store/location name is required." }, 400, request);
  const store = { id: id("store"), name, location: clean(body.location, 0, 200) || null };
  await env.DB.prepare("INSERT INTO stores (id, name, location) VALUES (?, ?, ?)").bind(store.id, store.name, store.location).run();
  await audit(env, user.id, "STORE_CREATED", "stores", store.id, store);
  return json({ store }, 201, request);
}

async function listEmployees(env, request, url) {
  const q = `%${(url.searchParams.get("q") || "").trim()}%`;
  const departmentId = url.searchParams.get("departmentId") || null;
  const storeId = url.searchParams.get("storeId") || null;
  const status = url.searchParams.get("status") || null;
  const conditions = ["(e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ?)"];
  const binds = [q, q, q];
  if (departmentId) { conditions.push("e.department_id = ?"); binds.push(departmentId); }
  if (storeId) { conditions.push("e.store_id = ?"); binds.push(storeId); }
  if (status) { conditions.push("e.employment_status = ?"); binds.push(status); }

  const rows = await env.DB.prepare(`SELECT e.*, d.name AS department_name, s.name AS store_name
    FROM employee_profiles e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN stores s ON s.id = e.store_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.created_at DESC LIMIT 200`).bind(...binds).all();
  return json({ employees: rows.results }, 200, request);
}

async function createEmployee(request, env, user) {
  const body = await readJson(request);
  const employee = normalizeEmployeeBody(body, true);
  const employeeId = id("emp");

  await env.DB.prepare(`INSERT INTO employee_profiles
    (id, employee_code, full_name, email, phone, department_id, store_id, job_title, hire_date, salary_type, base_salary, overtime_enabled, benefits_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(employeeId, employee.employee_code, employee.full_name, employee.email, employee.phone, employee.department_id, employee.store_id, employee.job_title, employee.hire_date, employee.salary_type, employee.base_salary, employee.overtime_enabled, employee.benefits_enabled)
    .run();
  await audit(env, user.id, "EMPLOYEE_CREATED", "employee_profiles", employeeId, employee);
  return json({ employee: { id: employeeId, ...employee } }, 201, request);
}

async function updateEmployee(employeeId, request, env, user) {
  const body = await readJson(request);
  const employee = normalizeEmployeeBody(body, false);
  const existing = await env.DB.prepare("SELECT id FROM employee_profiles WHERE id = ?").bind(employeeId).first();
  if (!existing) return json({ error: "Employee not found." }, 404, request);

  await env.DB.prepare(`UPDATE employee_profiles SET
    employee_code = COALESCE(?, employee_code),
    full_name = COALESCE(?, full_name),
    email = ?,
    phone = ?,
    department_id = ?,
    store_id = ?,
    job_title = ?,
    hire_date = ?,
    salary_type = COALESCE(?, salary_type),
    base_salary = COALESCE(?, base_salary),
    overtime_enabled = COALESCE(?, overtime_enabled),
    benefits_enabled = COALESCE(?, benefits_enabled),
    employment_status = COALESCE(?, employment_status),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`)
    .bind(employee.employee_code, employee.full_name, employee.email, employee.phone, employee.department_id, employee.store_id, employee.job_title, employee.hire_date, employee.salary_type, employee.base_salary, employee.overtime_enabled, employee.benefits_enabled, employee.employment_status, employeeId)
    .run();
  await audit(env, user.id, "EMPLOYEE_UPDATED", "employee_profiles", employeeId, body);
  const updated = await env.DB.prepare("SELECT * FROM employee_profiles WHERE id = ?").bind(employeeId).first();
  return json({ employee: updated }, 200, request);
}

function normalizeEmployeeBody(body, creating) {
  const employee_code = clean(body.employeeCode || body.employee_code, creating ? 1 : 0, 40);
  const full_name = clean(body.fullName || body.full_name, creating ? 2 : 0, 120);
  if (creating && (!employee_code || !full_name)) throw httpError(400, "Employee code and full name are required.");
  const salary = body.baseSalary ?? body.base_salary;
  const overtime = body.overtimeEnabled ?? body.overtime_enabled;
  const benefits = body.benefitsEnabled ?? body.benefits_enabled;
  return {
    employee_code: employee_code || null,
    full_name: full_name || null,
    email: body.email ? cleanEmail(body.email) : null,
    phone: clean(body.phone, 0, 40) || null,
    department_id: clean(body.departmentId || body.department_id, 0, 80) || null,
    store_id: clean(body.storeId || body.store_id, 0, 80) || null,
    job_title: clean(body.jobTitle || body.job_title, 0, 100) || null,
    hire_date: clean(body.hireDate || body.hire_date, 0, 20) || null,
    salary_type: ["MONTHLY", "DAILY", "HOURLY"].includes(body.salaryType || body.salary_type) ? (body.salaryType || body.salary_type) : (creating ? "MONTHLY" : null),
    base_salary: salary === undefined || salary === null || salary === "" ? (creating ? 0 : null) : Number(salary),
    overtime_enabled: overtime === undefined ? (creating ? 1 : null) : boolInt(overtime),
    benefits_enabled: benefits === undefined ? (creating ? 1 : null) : boolInt(benefits),
    employment_status: body.employmentStatus || body.employment_status || null
  };
}

async function listAttendance(env, request, url) {
  const from = url.searchParams.get("from") || today();
  const to = url.searchParams.get("to") || from;
  const employeeId = url.searchParams.get("employeeId") || null;
  const binds = [from, to];
  const conditions = ["a.work_date BETWEEN ? AND ?"];
  if (employeeId) { conditions.push("a.employee_id = ?"); binds.push(employeeId); }
  const rows = await env.DB.prepare(`SELECT a.*, e.employee_code, e.full_name
    FROM attendance_records a
    JOIN employee_profiles e ON e.id = a.employee_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.work_date DESC, e.full_name ASC LIMIT 500`).bind(...binds).all();
  return json({ attendance: rows.results }, 200, request);
}

async function upsertAttendance(request, env, user) {
  const body = await readJson(request);
  const employeeId = clean(body.employeeId || body.employee_id, 2, 100);
  const workDate = clean(body.workDate || body.work_date || today(), 10, 10);
  const status = body.status || "PRESENT";
  if (!employeeId || !workDate) return json({ error: "Employee and date are required." }, 400, request);
  if (!["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY", "OFF_DAY"].includes(status)) return json({ error: "Invalid attendance status." }, 400, request);

  const recordId = id("att");
  await env.DB.prepare(`INSERT INTO attendance_records
    (id, employee_id, work_date, check_in, check_out, status, source, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)
    ON CONFLICT(employee_id, work_date) DO UPDATE SET
      check_in = excluded.check_in,
      check_out = excluded.check_out,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(recordId, employeeId, workDate, body.checkIn || body.check_in || null, body.checkOut || body.check_out || null, status, clean(body.notes, 0, 500) || null, user.id)
    .run();
  await audit(env, user.id, "ATTENDANCE_UPSERTED", "attendance_records", `${employeeId}:${workDate}`, body);
  return json({ ok: true }, 200, request);
}

async function listAdvances(env, request, url) {
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const rows = await env.DB.prepare(`SELECT a.*, e.employee_code, e.full_name
    FROM advances a JOIN employee_profiles e ON e.id = a.employee_id
    WHERE substr(a.advance_date, 1, 7) = ?
    ORDER BY a.advance_date DESC`).bind(month).all();
  return json({ advances: rows.results }, 200, request);
}

async function createAdvance(request, env, user) {
  const body = await readJson(request);
  const employeeId = clean(body.employeeId || body.employee_id, 2, 100);
  const amount = Number(body.amount);
  const advanceDate = clean(body.advanceDate || body.advance_date || today(), 10, 10);
  if (!employeeId || !Number.isFinite(amount) || amount <= 0) return json({ error: "Employee and valid advance amount are required." }, 400, request);
  const advanceId = id("adv");
  await env.DB.prepare("INSERT INTO advances (id, employee_id, amount, advance_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(advanceId, employeeId, amount, advanceDate, clean(body.notes, 0, 300) || null, user.id).run();
  await audit(env, user.id, "ADVANCE_CREATED", "advances", advanceId, body);
  return json({ ok: true, id: advanceId }, 201, request);
}

async function payrollPreview(env, request, url) {
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "Use month format YYYY-MM." }, 400, request);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

  const employees = await env.DB.prepare(`SELECT id, employee_code, full_name, salary_type, base_salary, overtime_enabled, benefits_enabled
    FROM employee_profiles WHERE employment_status = 'ACTIVE' ORDER BY full_name`).all();

  const rows = [];
  for (const e of employees.results) {
    const attendance = await env.DB.prepare(`SELECT
        SUM(CASE WHEN status = 'ABSENT' THEN 1 WHEN status = 'HALF_DAY' THEN 0.5 ELSE 0 END) AS absent_days,
        SUM(CASE WHEN status = 'PRESENT' THEN 1 WHEN status = 'HALF_DAY' THEN 0.5 ELSE 0 END) AS worked_days
      FROM attendance_records WHERE employee_id = ? AND substr(work_date, 1, 7) = ?`)
      .bind(e.id, month).first();

    const advances = await scalar(env.DB, "SELECT COALESCE(SUM(amount),0) FROM advances WHERE employee_id = ? AND substr(advance_date, 1, 7) = ? AND status = 'APPROVED'", [e.id, month]);
    const overtime = Number(e.overtime_enabled) === 1
      ? await scalar(env.DB, "SELECT COALESCE(SUM(amount),0) FROM overtime_entries WHERE employee_id = ? AND substr(work_date, 1, 7) = ? AND status = 'APPROVED'", [e.id, month])
      : 0;
    const benefits = Number(e.benefits_enabled) === 1
      ? await scalar(env.DB, `SELECT COALESCE(SUM(COALESCE(eb.amount_override, bt.amount)),0)
          FROM employee_benefits eb JOIN benefit_types bt ON bt.id = eb.benefit_type_id
          WHERE eb.employee_id = ? AND eb.is_active = 1`, [e.id])
      : 0;

    const absentDays = Number(attendance?.absent_days || 0);
    const workedDays = Number(attendance?.worked_days || 0);
    const baseSalary = Number(e.base_salary || 0);
    const dailyRate = e.salary_type === "DAILY" ? baseSalary : baseSalary / daysInMonth;
    const absentDeductions = roundMoney(absentDays * dailyRate);
    const gross = roundMoney(baseSalary + Number(overtime) + Number(benefits));
    const net = roundMoney(gross - absentDeductions - Number(advances));

    rows.push({
      employeeId: e.id,
      employeeCode: e.employee_code,
      fullName: e.full_name,
      salaryType: e.salary_type,
      daysInMonth,
      workedDays,
      absentDays,
      baseSalary,
      dailyRate: roundMoney(dailyRate),
      overtimeAmount: roundMoney(Number(overtime)),
      benefitsAmount: roundMoney(Number(benefits)),
      advancesAmount: roundMoney(Number(advances)),
      absentDeductions,
      grossSalary: gross,
      netSalary: net
    });
  }

  return json({ month, rows }, 200, request);
}

async function listBiometricDevices(env, request) {
  const rows = await env.DB.prepare("SELECT * FROM biometric_devices ORDER BY created_at DESC").all();
  return json({ devices: rows.results }, 200, request);
}

async function createBiometricDevice(request, env, user) {
  const body = await readJson(request);
  const name = clean(body.name, 2, 120);
  if (!name) return json({ error: "Device name is required." }, 400, request);
  const device = {
    id: id("bio"),
    name,
    serial_number: clean(body.serialNumber || body.serial_number, 0, 120) || null,
    location: clean(body.location, 0, 200) || null,
    mode: body.mode === "LOCAL_BRIDGE" ? "LOCAL_BRIDGE" : "PUSH_API"
  };
  await env.DB.prepare("INSERT INTO biometric_devices (id, name, serial_number, location, mode) VALUES (?, ?, ?, ?, ?)")
    .bind(device.id, device.name, device.serial_number, device.location, device.mode).run();
  await audit(env, user.id, "BIOMETRIC_DEVICE_CREATED", "biometric_devices", device.id, device);
  return json({ device }, 201, request);
}

async function biometricPush(request, env) {
  const configuredToken = env.BIOMETRIC_PUSH_TOKEN;
  const providedToken = request.headers.get("x-biometric-token") || "";
  if (!configuredToken || providedToken !== configuredToken) {
    return json({ error: "Invalid biometric push token." }, 401, request);
  }

  const body = await readJson(request);
  const eventId = id("bioevt");
  const employeeCode = clean(body.employeeCode || body.employee_code, 1, 80);
  const eventTime = clean(body.eventTime || body.event_time || new Date().toISOString(), 10, 40);
  const eventType = ["CHECK", "IN", "OUT"].includes(body.eventType || body.event_type) ? (body.eventType || body.event_type) : "CHECK";

  if (!employeeCode || !eventTime) return json({ error: "Employee code and event time are required." }, 400, request);

  const device = body.deviceSerial || body.device_serial
    ? await env.DB.prepare("SELECT id FROM biometric_devices WHERE serial_number = ?").bind(body.deviceSerial || body.device_serial).first()
    : null;

  await env.DB.prepare("INSERT INTO biometric_events (id, device_id, employee_code, event_time, event_type, raw_payload) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(eventId, device?.id || null, employeeCode, eventTime, eventType, JSON.stringify(body)).run();
  if (device?.id) await env.DB.prepare("UPDATE biometric_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(device.id).run();

  return json({ ok: true, eventId }, 201, request);
}

async function getEffectiveApprovalRequirement(env) {
  const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'approval_requests_enabled'").first();
  const enabled = parseSetting(setting?.value) === true;
  if (!enabled) return false;
  const approvalRoles = await scalar(env.DB, "SELECT COUNT(*) FROM users WHERE role IN ('HR','MANAGER','ACCOUNTANT') AND status = 'ACTIVE'");
  return Number(approvalRoles) > 0;
}

function assertRole(user, allowed) {
  if (!allowed.includes(user.role)) throw httpError(403, "You do not have permission to perform this action.");
}

async function audit(env, actorUserId, action, entityType, entityId, details) {
  try {
    await env.DB.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id("audit"), actorUserId || null, action, entityType || null, entityId || null, JSON.stringify(details || {})).run();
  } catch (error) {
    console.warn("Audit log failed", error);
  }
}

async function scalar(db, sql, binds = []) {
  const row = await db.prepare(sql).bind(...binds).first();
  if (!row) return 0;
  const firstKey = Object.keys(row)[0];
  return row[firstKey];
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw httpError(400, "Invalid JSON body."); }
}

function json(data, status = 200, request, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request), ...extraHeaders }
  });
}

function htmlResponse(body, status = 200) {
  return new Response(`<!doctype html><html><body>${escapeHtml(body)}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function corsHeaders(request) {
  const origin = request?.headers?.get("origin");
  return origin ? {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-biometric-token"
  } : {};
}

function sessionCookie(token, days) {
  return {
    "set-cookie": `hrm_session=${token}; Max-Age=${days * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax`
  };
}

function clearSessionCookie() {
  return { "set-cookie": "hrm_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" };
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    twoFactorEnabled: Number(user.totp_enabled || 0) === 1
  };
}

function clean(value, min = 0, max = 255) {
  const text = String(value ?? "").trim();
  if (text.length < min) return "";
  return text.slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 3, 190).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function parseSetting(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  return Number.isFinite(num) && String(num) === String(value) ? num : value;
}

function boolInt(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 310000;
  const key = await crypto.subtle.importKey("raw", textBytes(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${base64Url(salt)}$${base64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, iterText, saltText, hashText] = String(stored).split("$");
    if (scheme !== "pbkdf2") return false;
    const salt = base64UrlDecode(saltText);
    const iterations = Number(iterText);
    const key = await crypto.subtle.importKey("raw", textBytes(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
    return timingSafeEqual(new Uint8Array(bits), base64UrlDecode(hashText));
  } catch {
    return false;
  }
}

async function sha256(text) {
  const hash = await crypto.subtle.digest("SHA-256", textBytes(text));
  return base64Url(new Uint8Array(hash));
}

function textBytes(text) {
  return new TextEncoder().encode(text);
}

function base64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

function base32Random(byteLength) {
  return base32Encode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function base32Encode(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanInput = String(input).replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of cleanInput) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -1; offset <= 1; offset++) {
    const candidate = await totp(secret, counter + offset);
    if (candidate === code) return true;
  }
  return false;
}

async function totp(secret, counter) {
  const key = base32Decode(secret);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  const big = BigInt(counter);
  view.setUint32(0, Number((big >> 32n) & 0xffffffffn));
  view.setUint32(4, Number(big & 0xffffffffn));
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
