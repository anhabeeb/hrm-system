const state = {
  user: null,
  page: 'dashboard',
  departments: [],
  stores: [],
  employees: []
};

const app = document.querySelector('#app');

boot();

async function boot() {
  try {
    const setup = await api('/api/setup/status');
    if (setup.setupRequired) return renderSetup();
    const me = await api('/api/auth/me', {}, false);
    if (!me?.user) return renderLogin();
    state.user = me.user;
    renderApp();
  } catch {
    renderLogin();
  }
}

async function api(path, options = {}, throwOnError = true) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok && throwOnError) throw new Error(data.error || 'Request failed');
  return data;
}

function renderSetup(error = '') {
  app.innerHTML = `
    <main class="auth-card">
      <h1>Set up your HRM system</h1>
      <p>Create the company profile and first Superadmin user. No default passwords are used.</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      <form id="setupForm" class="form-grid">
        <label>Company name <input name="companyName" required placeholder="Example: Cafe Asiana" /></label>
        <label>Your full name <input name="fullName" required placeholder="Superadmin name" /></label>
        <label>Email <input name="email" type="email" required placeholder="admin@example.com" /></label>
        <label>Password <input name="password" type="password" required minlength="10" placeholder="Minimum 10 characters" /></label>
        <button class="primary-btn">Create system</button>
      </form>
    </main>`;
  document.querySelector('#setupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = formBody(event.target);
    try {
      const result = await api('/api/setup/complete', { method: 'POST', body });
      state.user = result.user;
      renderApp();
    } catch (err) { renderSetup(err.message); }
  });
}

function renderLogin(error = '', requires2fa = false, previous = {}) {
  app.innerHTML = `
    <main class="auth-card">
      <h1>Welcome back</h1>
      <p>Sign in to manage employees, attendance, payroll previews, settings, and biometric sync.</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      <form id="loginForm" class="form-grid">
        <label>Email <input name="email" type="email" required value="${escapeHtml(previous.email || '')}" /></label>
        <label>Password <input name="password" type="password" required value="${escapeHtml(previous.password || '')}" /></label>
        ${requires2fa ? `<label>Google Authenticator code <input name="totpCode" inputmode="numeric" maxlength="6" required /></label>` : ''}
        <button class="primary-btn">Sign in</button>
      </form>
    </main>`;
  document.querySelector('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = formBody(event.target);
    try {
      const result = await api('/api/auth/login', { method: 'POST', body });
      if (result.requires2fa) return renderLogin('', true, body);
      state.user = result.user;
      renderApp();
    } catch (err) { renderLogin(err.message, requires2fa, body); }
  });
}

function renderApp() {
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">HR</div><div><div class="brand-text">HRM System</div><span class="helper">Cloudflare Worker</span></div></div>
        <div class="user-pill"><strong>${escapeHtml(state.user.fullName)}</strong><span>${escapeHtml(state.user.role)}</span></div>
        <nav class="nav">
          ${navButton('dashboard', 'Dashboard')}
          ${navButton('employees', 'Employees')}
          ${navButton('attendance', 'Attendance')}
          ${navButton('payroll', 'Payroll Preview')}
          ${navButton('settings', 'Settings')}
          ${navButton('security', 'Security / 2FA')}
        </nav>
        <div class="sidebar-footer"><button id="logoutBtn" class="danger-btn">Log out</button></div>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
  document.querySelectorAll('[data-page]').forEach((btn) => btn.addEventListener('click', () => { state.page = btn.dataset.page; renderApp(); }));
  document.querySelector('#logoutBtn').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; renderLogin(); });
  renderPage();
}

function navButton(page, label) {
  return `<button data-page="${page}" class="${state.page === page ? 'active' : ''}">${label}</button>`;
}

async function renderPage() {
  const main = document.querySelector('#main');
  if (state.page === 'dashboard') return renderDashboard(main);
  if (state.page === 'employees') return renderEmployees(main);
  if (state.page === 'attendance') return renderAttendance(main);
  if (state.page === 'payroll') return renderPayroll(main);
  if (state.page === 'settings') return renderSettings(main);
  if (state.page === 'security') return renderSecurity(main);
}

async function renderDashboard(main) {
  main.innerHTML = header('Dashboard', 'A simple overview of your HRM system.') + skeletonCards();
  const data = await api('/api/dashboard');
  main.innerHTML = header('Dashboard', 'A simple overview of your HRM system.') + `
    <section class="grid cols-4">
      ${metric('Active employees', data.employees)}
      ${metric('Departments', data.departments)}
      ${metric('Present today', data.presentToday)}
      ${metric('Pending approvals', data.pendingApprovals)}
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Next build focus</h2>
      <p class="helper">This first version establishes secure setup/login, D1 schema, employee records, attendance, payroll preview, 2FA foundations, settings, and biometric push ingestion. We can now expand module-by-module.</p>
    </section>`;
}

function metric(label, value) {
  return `<div class="card metric"><span>${label}</span><strong>${value ?? 0}</strong></div>`;
}

function skeletonCards() {
  return `<section class="grid cols-4">${metric('Loading', '...')}${metric('Loading', '...')}${metric('Loading', '...')}${metric('Loading', '...')}</section>`;
}

async function loadLookups() {
  const [departments, stores, employees] = await Promise.all([
    api('/api/departments'), api('/api/stores'), api('/api/employees')
  ]);
  state.departments = departments.departments || [];
  state.stores = stores.stores || [];
  state.employees = employees.employees || [];
}

async function renderEmployees(main, message = '') {
  await loadLookups();
  main.innerHTML = header('Employees', 'Create and manage employee profiles with salary, department, location, overtime, and benefits controls.') + `
    ${message ? `<div class="success-msg">${escapeHtml(message)}</div>` : ''}
    <section class="card">
      <h2>Add employee</h2>
      <form id="employeeForm" class="grid cols-3">
        <label>Employee code <input name="employeeCode" required placeholder="EMP-0002" /></label>
        <label>Full name <input name="fullName" required /></label>
        <label>Email <input name="email" type="email" /></label>
        <label>Phone <input name="phone" /></label>
        <label>Department <select name="departmentId">${options(state.departments, 'name')}</select></label>
        <label>Store/location <select name="storeId">${options(state.stores, 'name')}</select></label>
        <label>Job title <input name="jobTitle" /></label>
        <label>Hire date <input name="hireDate" type="date" /></label>
        <label>Salary type <select name="salaryType"><option>MONTHLY</option><option>DAILY</option><option>HOURLY</option></select></label>
        <label>Base salary <input name="baseSalary" type="number" step="0.01" value="0" /></label>
        <label>Overtime <select name="overtimeEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label>Benefits <select name="benefitsEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <button class="primary-btn">Save employee</button>
      </form>
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Employee list</h2>
      <div class="table-wrap">${employeesTable(state.employees)}</div>
    </section>`;
  document.querySelector('#employeeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = formBody(event.target);
    body.overtimeEnabled = body.overtimeEnabled === 'true';
    body.benefitsEnabled = body.benefitsEnabled === 'true';
    try { await api('/api/employees', { method: 'POST', body }); renderEmployees(main, 'Employee saved.'); }
    catch (err) { main.querySelector('.card').insertAdjacentHTML('beforebegin', `<div class="error">${escapeHtml(err.message)}</div>`); }
  });
}

function employeesTable(rows) {
  if (!rows.length) return '<div class="notice">No employees yet. Add your first employee above.</div>';
  return `<table><thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Store</th><th>Salary</th><th>Status</th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td>${escapeHtml(e.employee_code)}</td><td>${escapeHtml(e.full_name)}</td><td>${escapeHtml(e.department_name || '-')}</td><td>${escapeHtml(e.store_name || '-')}</td><td>${money(e.base_salary)}</td><td><span class="badge success">${escapeHtml(e.employment_status)}</span></td></tr>`).join('')}
  </tbody></table>`;
}

async function renderAttendance(main, message = '') {
  await loadLookups();
  const today = new Date().toISOString().slice(0, 10);
  const data = await api(`/api/attendance?from=${today}&to=${today}`);
  main.innerHTML = header('Attendance', 'Record daily attendance manually. Biometric events can be connected through the push API later.') + `
    ${message ? `<div class="success-msg">${escapeHtml(message)}</div>` : ''}
    <section class="card">
      <h2>Record attendance</h2>
      <form id="attendanceForm" class="inline-form">
        <label>Employee <select name="employeeId" required>${options(state.employees, 'full_name')}</select></label>
        <label>Date <input name="workDate" type="date" value="${today}" required /></label>
        <label>Status <select name="status"><option>PRESENT</option><option>ABSENT</option><option>HALF_DAY</option><option>LEAVE</option><option>HOLIDAY</option><option>OFF_DAY</option></select></label>
        <label>Notes <input name="notes" /></label>
        <button class="primary-btn">Save</button>
      </form>
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Today</h2>
      <div class="table-wrap">${attendanceTable(data.attendance || [])}</div>
    </section>`;
  document.querySelector('#attendanceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/attendance', { method: 'POST', body: formBody(event.target) }); renderAttendance(main, 'Attendance saved.'); }
    catch (err) { main.querySelector('.card').insertAdjacentHTML('beforebegin', `<div class="error">${escapeHtml(err.message)}</div>`); }
  });
}

function attendanceTable(rows) {
  if (!rows.length) return '<div class="notice">No attendance records for today.</div>';
  return `<table><thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>Source</th><th>Notes</th></tr></thead><tbody>
    ${rows.map((a) => `<tr><td>${escapeHtml(a.work_date)}</td><td>${escapeHtml(a.full_name)}</td><td><span class="badge ${a.status === 'ABSENT' ? 'danger' : 'success'}">${escapeHtml(a.status)}</span></td><td>${escapeHtml(a.source)}</td><td>${escapeHtml(a.notes || '-')}</td></tr>`).join('')}
  </tbody></table>`;
}

async function renderPayroll(main) {
  const month = new Date().toISOString().slice(0, 7);
  const data = await api(`/api/payroll/preview?month=${month}`);
  main.innerHTML = header('Payroll Preview', 'Preview monthly salary, absent deductions, overtime, benefits, advances, and net pay before final payroll approval.') + `
    <section class="card">
      <h2>${escapeHtml(month)} payroll preview</h2>
      <div class="table-wrap">${payrollTable(data.rows || [])}</div>
    </section>`;
}

function payrollTable(rows) {
  if (!rows.length) return '<div class="notice">No active employees to preview.</div>';
  return `<table><thead><tr><th>Employee</th><th>Base</th><th>Worked</th><th>Absent</th><th>Deduction</th><th>Overtime</th><th>Benefits</th><th>Advances</th><th>Net</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${escapeHtml(r.fullName)}</td><td>${money(r.baseSalary)}</td><td>${r.workedDays}</td><td>${r.absentDays}</td><td>${money(r.absentDeductions)}</td><td>${money(r.overtimeAmount)}</td><td>${money(r.benefitsAmount)}</td><td>${money(r.advancesAmount)}</td><td><strong>${money(r.netSalary)}</strong></td></tr>`).join('')}
  </tbody></table>`;
}

async function renderSettings(main, message = '') {
  const data = await api('/api/settings');
  const s = data.settings || {};
  main.innerHTML = header('Settings', 'Control approval workflow, overtime, benefits, long leave deductions, and biometric integration.') + `
    ${message ? `<div class="success-msg">${escapeHtml(message)}</div>` : ''}
    <section class="card">
      <form id="settingsForm" class="grid">
        ${switchRow('approval_requests_enabled', 'Approval requests', 'Superadmin can enable/disable approval requests. If no HR, Manager, or Accountant users exist, approvals are automatically not required.', s.approval_requests_enabled)}
        ${switchRow('overtime_enabled', 'Overtime module', 'Global overtime control. Employees also have individual overtime switches.', s.overtime_enabled)}
        ${switchRow('benefits_enabled', 'Benefits module', 'Global benefits control. Employees also have individual benefits switches.', s.benefits_enabled)}
        ${switchRow('biometric_integration_enabled', 'Biometric integration', 'Prepare the system for local bridge or device push API attendance sync.', s.biometric_integration_enabled)}
        <label>Long leave salary deduction mode
          <select name="long_leave_deduction_mode">
            ${['NONE','DAILY_RATE','FIXED_AMOUNT','PERCENTAGE'].map((v) => `<option ${s.long_leave_deduction_mode === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </label>
        <div class="notice">Effective approval required: <strong>${s.effectiveApprovalRequired ? 'Yes' : 'No'}</strong></div>
        <button class="primary-btn">Save settings</button>
      </form>
    </section>`;
  document.querySelector('#settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = formBody(event.target);
    ['approval_requests_enabled','overtime_enabled','benefits_enabled','biometric_integration_enabled'].forEach((key) => body[key] = body[key] === 'on');
    try { await api('/api/settings', { method: 'PUT', body }); renderSettings(main, 'Settings saved.'); }
    catch (err) { main.querySelector('.card').insertAdjacentHTML('beforebegin', `<div class="error">${escapeHtml(err.message)}</div>`); }
  });
}

function switchRow(name, title, description, checked) {
  return `<div class="switch-row"><div><strong>${title}</strong><p>${description}</p></div><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} /></div>`;
}

async function renderSecurity(main, message = '') {
  main.innerHTML = header('Security / 2FA', 'Enable Google Authenticator two-factor authentication for your account.') + `
    ${message ? `<div class="success-msg">${escapeHtml(message)}</div>` : ''}
    <section class="card">
      <h2>Two-factor authentication</h2>
      <p class="helper">Current status: <strong>${state.user.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</strong></p>
      <div class="actions">
        <button id="setup2fa" class="primary-btn">Generate 2FA secret</button>
      </div>
      <div id="twofaBox" style="margin-top:16px"></div>
    </section>`;
  document.querySelector('#setup2fa').addEventListener('click', async () => {
    const data = await api('/api/auth/2fa/setup', { method: 'POST' });
    document.querySelector('#twofaBox').innerHTML = `
      <div class="notice">
        <p><strong>Secret:</strong> ${escapeHtml(data.secret)}</p>
        <p class="helper">Add this to Google Authenticator, then enter the 6-digit code below.</p>
      </div>
      <form id="enable2fa" class="inline-form" style="margin-top:12px">
        <label>Code <input name="code" inputmode="numeric" maxlength="6" required /></label>
        <button class="primary-btn">Enable 2FA</button>
      </form>`;
    document.querySelector('#enable2fa').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('/api/auth/2fa/enable', { method: 'POST', body: formBody(event.target) });
        state.user.twoFactorEnabled = true;
        renderSecurity(main, 'Two-factor authentication enabled.');
      } catch (err) {
        document.querySelector('#twofaBox').insertAdjacentHTML('afterbegin', `<div class="error">${escapeHtml(err.message)}</div>`);
      }
    });
  });
}

function header(title, subtitle) {
  return `<div class="topbar"><div><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}

function options(items, labelKey) {
  return `<option value="">Select</option>` + items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item[labelKey])}</option>`).join('');
}

function formBody(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function money(value) {
  return `MVR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
