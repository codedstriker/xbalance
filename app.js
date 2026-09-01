const SUPABASE_URL = "https://moxwhdojgbjvlatkvzgp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veHdoZG9qZ2JqdmxhdGt2emdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjQ2MTAsImV4cCI6MjEwMzg0MDYxMH0.SQxk4ECN8fcVE4u5FhQ-ZrNqvJ0ToJ5okGVkNOa94gA";

const DEFAULT_CURRENCY = "MYR";

const CURRENCIES = {
  USD: { locale: "en-US", label: "USD ($)" },
  EUR: { locale: "en-US", label: "EUR (€)" },
  AED: { locale: "ar-AE", label: "AED (د.إ)" },
  MYR: { locale: "ms-MY", label: "MYR (RM)" }
};

const VIEW_META = {
  dashboard: { title: "Dashboard", eyebrow: "Overview" },
  transactions: { title: "Transactions", eyebrow: "Finance" },
  categories: { title: "Categories", eyebrow: "Organisation" },
  payments: { title: "Payment Methods", eyebrow: "Organisation" },
  settings: { title: "Settings", eyebrow: "Account" }
};

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const state = {
  user: null,
  profile: null,
  currency: localStorage.getItem("xbalance-currency") || DEFAULT_CURRENCY,
  activeView: localStorage.getItem("xbalance-active-view") || "dashboard",
  categories: [],
  paymentMethods: [],
  transactions: [],
  cashflowChart: null,
  expenseChart: null
};

const elements = {};

function pageUrl(filename) {
  return new URL(filename, window.location.href).href;
}

function cacheElements() {
  [
    "sidebar",
    "sidebar-close",
    "drawer-overlay",
    "menu-toggle",
    "page-title",
    "page-eyebrow",
    "theme-toggle",
    "currency-select",
    "settings-currency-select",
    "signout-button",
    "sidebar-user-email",
    "dashboard-message",
    "balance-total",
    "income-total",
    "expense-total",
    "cashflow-chart",
    "expense-chart",
    "recent-transactions-table-body",
    "transactions-table-body",
    "categories-table-body",
    "payment-methods-table-body",
    "transaction-form",
    "transaction-form-title",
    "transaction-id",
    "transaction-type",
    "transaction-amount",
    "transaction-category",
    "transaction-payment-method",
    "transaction-date",
    "transaction-description",
    "cancel-transaction-edit",
    "category-form",
    "category-form-title",
    "category-id",
    "category-name",
    "category-type",
    "category-color",
    "cancel-category-edit",
    "payment-form",
    "payment-form-title",
    "payment-id",
    "payment-name",
    "cancel-payment-edit",
    "profile-form",
    "profile-display-name",
    "password-form",
    "new-password",
    "confirm-password",
    "password-reset-button",
    "settings-email",
    "privacy-button",
    "privacy-modal",
    "delete-confirmation",
    "delete-account-button"
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function setMessage(message = "", isError = false) {
  elements["dashboard-message"].textContent = message;
  elements["dashboard-message"].classList.toggle("is-error", isError);
}

function escapeHtml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRelation(transaction, relationName) {
  const relation = transaction[relationName];
  return Array.isArray(relation) ? relation[0] : relation;
}

function getCssVariable(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatMoney(value) {
  const currency = CURRENCIES[state.currency] ? state.currency : DEFAULT_CURRENCY;

  return new Intl.NumberFormat(CURRENCIES[currency].locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function setTodayAsTransactionDate() {
  elements["transaction-date"].value = new Date().toISOString().slice(0, 10);
}

function closeDrawer() {
  elements.sidebar.classList.remove("is-open");
  elements["drawer-overlay"].classList.remove("is-visible");
  elements["drawer-overlay"].setAttribute("aria-hidden", "true");
}

function openDrawer() {
  elements.sidebar.classList.add("is-open");
  elements["drawer-overlay"].classList.add("is-visible");
  elements["drawer-overlay"].setAttribute("aria-hidden", "false");
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("xbalance-theme", theme);

  const isDark = theme === "dark";
  elements["theme-toggle"].setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode"
  );
  elements["theme-toggle"].textContent = isDark ? "☀" : "◐";

  if (state.cashflowChart || state.expenseChart) {
    renderCharts();
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("xbalance-theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  setTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));
}

function setCurrency(currency) {
  if (!CURRENCIES[currency]) return;

  state.currency = currency;
  localStorage.setItem("xbalance-currency", currency);
  elements["currency-select"].value = currency;
  elements["settings-currency-select"].value = currency;

  renderAll();
}

function switchView(viewName) {
  const view = VIEW_META[viewName] ? viewName : "dashboard";
  state.activeView = view;
  localStorage.setItem("xbalance-active-view", view);

  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.id !== `view-${view}`);
  });

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const isActive = button.dataset.viewTarget === view;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  elements["page-title"].textContent = VIEW_META[view].title;
  elements["page-eyebrow"].textContent = VIEW_META[view].eyebrow;

  closeDrawer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openPrivacyModal() {
  elements["privacy-modal"].hidden = false;
  document.body.classList.add("modal-open");
}

function closePrivacyModal() {
  elements["privacy-modal"].hidden = true;
  document.body.classList.remove("modal-open");
}

async function requireAuthenticatedUser() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.replace(pageUrl("index.html"));
    return false;
  }

  state.user = session.user;
  elements["sidebar-user-email"].textContent = state.user.email || "Signed in";
  elements["settings-email"].textContent = state.user.email || "No email available";
  return true;
}

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("users")
    .select("display_name, is_deleted")
    .single();

  if (error) throw error;

  state.profile = data;

  if (data.is_deleted) {
    await supabaseClient.auth.signOut();
    window.location.replace(pageUrl("index.html"));
    return;
  }

  elements["profile-display-name"].value =
    data.display_name || state.user.user_metadata?.display_name || "";
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setMessage(error.message, true);
    return;
  }

  window.location.replace(pageUrl("index.html"));
}

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  state.categories = data || [];
}

async function loadPaymentMethods() {
  const { data, error } = await supabaseClient
    .from("payment_methods")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  state.paymentMethods = data || [];
}

async function loadTransactions() {
  const { data, error } = await supabaseClient
    .from("transactions")
    .select(`
      *,
      categories (id, name, type, color),
      payment_methods (id, name)
    `)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  state.transactions = data || [];
}

async function refreshDashboard() {
  try {
    setMessage("Refreshing data…");

    await Promise.all([
      loadProfile(),
      loadCategories(),
      loadPaymentMethods(),
      loadTransactions()
    ]);

    renderAll();
    setMessage("");
  } catch (error) {
    setMessage(error.message || "Unable to load your financial data.", true);
  }
}

function populateCategorySelect(selectedId = "") {
  const type = elements["transaction-type"].value;
  const categories = state.categories.filter((category) => category.type === type);

  elements["transaction-category"].innerHTML = categories.length
    ? categories
        .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
        .join("")
    : `<option value="">Create a ${type} category first</option>`;

  if (categories.some((category) => String(category.id) === String(selectedId))) {
    elements["transaction-category"].value = selectedId;
  }
}

function populatePaymentMethodSelect(selectedId = "") {
  elements["transaction-payment-method"].innerHTML = `
    <option value="">No payment method</option>
    ${state.paymentMethods
      .map((method) => `<option value="${method.id}">${escapeHtml(method.name)}</option>`)
      .join("")}
  `;

  if (state.paymentMethods.some((method) => String(method.id) === String(selectedId))) {
    elements["transaction-payment-method"].value = selectedId;
  }
}

function renderSummary() {
  const income = state.transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

  const expenses = state.transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

  elements["income-total"].textContent = formatMoney(income);
  elements["expense-total"].textContent = formatMoney(expenses);
  elements["balance-total"].textContent = formatMoney(income - expenses);
}

function renderRecentTransactions() {
  const recent = state.transactions.slice(0, 5);

  if (!recent.length) {
    elements["recent-transactions-table-body"].innerHTML =
      `<tr><td class="empty-state" colspan="4">No transactions yet.</td></tr>`;
    return;
  }

  elements["recent-transactions-table-body"].innerHTML = recent
    .map((transaction) => {
      const category = getRelation(transaction, "categories");
      const amountClass = transaction.type === "income" ? "amount-income" : "amount-expense";
      const prefix = transaction.type === "income" ? "+" : "−";

      return `
        <tr>
          <td>${formatDate(transaction.occurred_on)}</td>
          <td>
            <span class="category-label">
              <span class="color-dot" style="background-color:${escapeHtml(category?.color || "#94a3b8")}"></span>
              ${escapeHtml(category?.name)}
            </span>
          </td>
          <td>${escapeHtml(transaction.description)}</td>
          <td class="${amountClass}">${prefix}${formatMoney(transaction.amount)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTransactionsTable() {
  if (!state.transactions.length) {
    elements["transactions-table-body"].innerHTML =
      `<tr><td class="empty-state" colspan="7">No transactions yet. Add your first one above.</td></tr>`;
    return;
  }

  elements["transactions-table-body"].innerHTML = state.transactions
    .map((transaction) => {
      const category = getRelation(transaction, "categories");
      const paymentMethod = getRelation(transaction, "payment_methods");
      const amountClass = transaction.type === "income" ? "amount-income" : "amount-expense";
      const prefix = transaction.type === "income" ? "+" : "−";

      return `
        <tr>
          <td>${formatDate(transaction.occurred_on)}</td>
          <td><span class="type-badge ${transaction.type}">${escapeHtml(transaction.type)}</span></td>
          <td>
            <span class="category-label">
              <span class="color-dot" style="background-color:${escapeHtml(category?.color || "#94a3b8")}"></span>
              ${escapeHtml(category?.name)}
            </span>
          </td>
          <td>${escapeHtml(paymentMethod?.name)}</td>
          <td>${escapeHtml(transaction.description)}</td>
          <td class="${amountClass}">${prefix}${formatMoney(transaction.amount)}</td>
          <td>
            <div class="table-actions">
              <button class="button button-secondary button-small" type="button" data-action="edit-transaction" data-id="${transaction.id}">Edit</button>
              <button class="button button-danger button-small" type="button" data-action="delete-transaction" data-id="${transaction.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCategoriesTable() {
  if (!state.categories.length) {
    elements["categories-table-body"].innerHTML =
      `<tr><td class="empty-state" colspan="3">No categories yet.</td></tr>`;
    return;
  }

  elements["categories-table-body"].innerHTML = state.categories
    .map(
      (category) => `
        <tr>
          <td>
            <span class="category-label">
              <span class="color-dot" style="background-color:${escapeHtml(category.color)}"></span>
              ${escapeHtml(category.name)}
            </span>
          </td>
          <td><span class="type-badge ${category.type}">${escapeHtml(category.type)}</span></td>
          <td>
            <div class="table-actions">
              <button class="button button-secondary button-small" type="button" data-action="edit-category" data-id="${category.id}">Edit</button>
              <button class="button button-danger button-small" type="button" data-action="delete-category" data-id="${category.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderPaymentMethodsTable() {
  if (!state.paymentMethods.length) {
    elements["payment-methods-table-body"].innerHTML =
      `<tr><td class="empty-state" colspan="2">No payment methods yet.</td></tr>`;
    return;
  }

  elements["payment-methods-table-body"].innerHTML = state.paymentMethods
    .map(
      (method) => `
        <tr>
          <td>${escapeHtml(method.name)}</td>
          <td>
            <div class="table-actions">
              <button class="button button-secondary button-small" type="button" data-action="edit-payment" data-id="${method.id}">Edit</button>
              <button class="button button-danger button-small" type="button" data-action="delete-payment" data-id="${method.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderCharts() {
  const income = state.transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

  const expenseTransactions = state.transactions.filter(
    (transaction) => transaction.type === "expense"
  );

  const expenses = expenseTransactions.reduce(
    (total, transaction) => total + Number(transaction.amount),
    0
  );

  const expenseGroups = new Map();

  expenseTransactions.forEach((transaction) => {
    const category = getRelation(transaction, "categories");
    const key = category?.id || "uncategorised";

    if (!expenseGroups.has(key)) {
      expenseGroups.set(key, {
        name: category?.name || "Uncategorised",
        color: category?.color || getCssVariable("--text-faint"),
        total: 0
      });
    }

    expenseGroups.get(key).total += Number(transaction.amount);
  });

  if (state.cashflowChart) state.cashflowChart.destroy();
  if (state.expenseChart) state.expenseChart.destroy();

  const textColor = getCssVariable("--text-muted");
  const borderColor = getCssVariable("--border");
  const surfaceColor = getCssVariable("--surface");

  state.cashflowChart = new Chart(elements["cashflow-chart"], {
    type: "bar",
    data: {
      labels: ["Income", "Expenses"],
      datasets: [{
        data: [income, expenses],
        backgroundColor: [getCssVariable("--income"), getCssVariable("--expense")],
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => formatMoney(context.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor }
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: borderColor },
          ticks: {
            color: textColor,
            callback: (value) => formatMoney(value)
          }
        }
      }
    }
  });

  const breakdown = [...expenseGroups.values()];
  const hasExpenses = breakdown.length > 0;

  state.expenseChart = new Chart(elements["expense-chart"], {
    type: "doughnut",
    data: {
      labels: hasExpenses ? breakdown.map((item) => item.name) : ["No expense data"],
      datasets: [{
        data: hasExpenses ? breakdown.map((item) => item.total) : [1],
        backgroundColor: hasExpenses
          ? breakdown.map((item) => item.color)
          : [borderColor],
        borderColor: surfaceColor,
        borderWidth: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: textColor,
            boxWidth: 12,
            padding: 14
          }
        },
        tooltip: {
          callbacks: {
            label: (context) =>
              hasExpenses
                ? `${context.label}: ${formatMoney(context.raw)}`
                : "No expenses recorded"
          }
        }
      }
    }
  });
}

function renderAll() {
  populateCategorySelect(elements["transaction-category"].value);
  populatePaymentMethodSelect(elements["transaction-payment-method"].value);
  renderSummary();
  renderRecentTransactions();
  renderTransactionsTable();
  renderCategoriesTable();
  renderPaymentMethodsTable();
  renderCharts();
}

function resetTransactionForm() {
  elements["transaction-form"].reset();
  elements["transaction-id"].value = "";
  elements["transaction-type"].value = "expense";
  elements["transaction-form-title"].textContent = "Add transaction";
  elements["cancel-transaction-edit"].classList.add("is-hidden");
  setTodayAsTransactionDate();
  populateCategorySelect();
  populatePaymentMethodSelect();
}

function resetCategoryForm() {
  elements["category-form"].reset();
  elements["category-id"].value = "";
  elements["category-color"].value = "#10b981";
  elements["category-form-title"].textContent = "Add category";
  elements["cancel-category-edit"].classList.add("is-hidden");
}

function resetPaymentForm() {
  elements["payment-form"].reset();
  elements["payment-id"].value = "";
  elements["payment-form-title"].textContent = "Add payment method";
  elements["cancel-payment-edit"].classList.add("is-hidden");
}

function editTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;

  elements["transaction-id"].value = transaction.id;
  elements["transaction-type"].value = transaction.type;
  elements["transaction-amount"].value = transaction.amount;
  elements["transaction-date"].value = transaction.occurred_on;
  elements["transaction-description"].value = transaction.description || "";

  populateCategorySelect(transaction.category_id);
  populatePaymentMethodSelect(transaction.payment_method_id);

  elements["transaction-form-title"].textContent = "Edit transaction";
  elements["cancel-transaction-edit"].classList.remove("is-hidden");
  switchView("transactions");
  elements["transaction-form"].scrollIntoView({ behavior: "smooth", block: "start" });
}

function editCategory(id) {
  const category = state.categories.find((item) => String(item.id) === String(id));
  if (!category) return;

  elements["category-id"].value = category.id;
  elements["category-name"].value = category.name;
  elements["category-type"].value = category.type;
  elements["category-color"].value = category.color;
  elements["category-form-title"].textContent = "Edit category";
  elements["cancel-category-edit"].classList.remove("is-hidden");
  switchView("categories");
}

function editPaymentMethod(id) {
  const method = state.paymentMethods.find((item) => String(item.id) === String(id));
  if (!method) return;

  elements["payment-id"].value = method.id;
  elements["payment-name"].value = method.name;
  elements["payment-form-title"].textContent = "Edit payment method";
  elements["cancel-payment-edit"].classList.remove("is-hidden");
  switchView("payments");
}

async function saveTransaction(event) {
  event.preventDefault();

  const id = elements["transaction-id"].value;
  const payload = {
    type: elements["transaction-type"].value,
    amount: Number(elements["transaction-amount"].value),
    category_id: Number(elements["transaction-category"].value),
    payment_method_id: elements["transaction-payment-method"].value
      ? Number(elements["transaction-payment-method"].value)
      : null,
    occurred_on: elements["transaction-date"].value,
    description: elements["transaction-description"].value.trim() || null
  };

  if (!payload.category_id) {
    setMessage("Choose a valid category before saving.", true);
    return;
  }

  try {
    setMessage(id ? "Updating transaction…" : "Saving transaction…");

    const { error } = id
      ? await supabaseClient.from("transactions").update(payload).eq("id", id)
      : await supabaseClient.from("transactions").insert(payload);

    if (error) throw error;

    resetTransactionForm();
    await refreshDashboard();
  } catch (error) {
    setMessage(error.message || "Unable to save the transaction.", true);
  }
}

async function saveCategory(event) {
  event.preventDefault();

  const id = elements["category-id"].value;
  const payload = {
    name: elements["category-name"].value.trim(),
    type: elements["category-type"].value,
    color: elements["category-color"].value
  };

  try {
    setMessage(id ? "Updating category…" : "Saving category…");

    const { error } = id
      ? await supabaseClient.from("categories").update(payload).eq("id", id)
      : await supabaseClient.from("categories").insert(payload);

    if (error) throw error;

    resetCategoryForm();
    await refreshDashboard();
  } catch (error) {
    setMessage(
      error.message || "Unable to save the category. Categories used by transactions cannot change type.",
      true
    );
  }
}

async function savePaymentMethod(event) {
  event.preventDefault();

  const id = elements["payment-id"].value;
  const payload = { name: elements["payment-name"].value.trim() };

  try {
    setMessage(id ? "Updating payment method…" : "Saving payment method…");

    const { error } = id
      ? await supabaseClient.from("payment_methods").update(payload).eq("id", id)
      : await supabaseClient.from("payment_methods").insert(payload);

    if (error) throw error;

    resetPaymentForm();
    await refreshDashboard();
  } catch (error) {
    setMessage(error.message || "Unable to save the payment method.", true);
  }
}

async function deleteRecord(table, id, label) {
  if (!window.confirm(`Delete this ${label}? This action cannot be undone.`)) return;

  try {
    setMessage(`Deleting ${label}…`);

    const { error } = await supabaseClient.from(table).delete().eq("id", id);
    if (error) throw error;

    await refreshDashboard();
  } catch (error) {
    setMessage(
      error.message || `Unable to delete this ${label}. It may still be referenced by transactions.`,
      true
    );
  }
}

async function saveProfile(event) {
  event.preventDefault();

  const displayName = elements["profile-display-name"].value.trim();

  try {
    setMessage("Updating profile…");

    const authUpdate = await supabaseClient.auth.updateUser({
      data: { display_name: displayName }
    });

    if (authUpdate.error) throw authUpdate.error;

    const profileUpdate = await supabaseClient
      .from("users")
      .update({ display_name: displayName })
      .eq("id", state.user.id);

    if (profileUpdate.error) throw profileUpdate.error;

    state.user = authUpdate.data.user || state.user;
    setMessage("Profile updated.");
  } catch (error) {
    setMessage(error.message || "Unable to update your profile.", true);
  }
}

async function changePassword(event) {
  event.preventDefault();

  const password = elements["new-password"].value;
  const confirmation = elements["confirm-password"].value;

  if (password !== confirmation) {
    setMessage("The new password and confirmation do not match.", true);
    return;
  }

  try {
    setMessage("Updating password…");

    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;

    elements["password-form"].reset();
    setMessage("Password updated successfully.");
  } catch (error) {
    setMessage(error.message || "Unable to update your password.", true);
  }
}

async function requestPasswordReset() {
  try {
    localStorage.setItem("xbalance-active-view", "settings");
    setMessage("Sending password reset email…");

    const { error } = await supabaseClient.auth.resetPasswordForEmail(state.user.email, {
      redirectTo: pageUrl("dashboard.html")
    });

    if (error) throw error;

    setMessage("Password reset email sent. Check your inbox.");
  } catch (error) {
    setMessage(error.message || "Unable to send reset email.", true);
  }
}

async function deactivateAccount() {
  if (elements["delete-confirmation"].value.trim() !== "DELETE") {
    setMessage('Type DELETE exactly before deactivating the account.', true);
    return;
  }

  const confirmed = window.confirm(
    "This permanently deletes all transactions, categories, and payment methods. Continue?"
  );

  if (!confirmed) return;

  try {
    setMessage("Deactivating account and erasing financial data…");

    const { error } = await supabaseClient.rpc("deactivate_my_account");
    if (error) throw error;

    await supabaseClient.auth.signOut();
    window.location.replace(pageUrl("index.html"));
  } catch (error) {
    setMessage(
      error.message || "Unable to deactivate the account. Confirm the Supabase setup SQL has been run.",
      true
    );
  }
}

function handleTableAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "edit-transaction") editTransaction(id);
  if (action === "delete-transaction") deleteRecord("transactions", id, "transaction");
  if (action === "edit-category") editCategory(id);
  if (action === "delete-category") deleteRecord("categories", id, "category");
  if (action === "edit-payment") editPaymentMethod(id);
  if (action === "delete-payment") deleteRecord("payment_methods", id, "payment method");
}

function bindEvents() {
  elements["menu-toggle"].addEventListener("click", openDrawer);
  elements["sidebar-close"].addEventListener("click", closeDrawer);
  elements["drawer-overlay"].addEventListener("click", closeDrawer);

  elements["theme-toggle"].addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  elements["currency-select"].addEventListener("change", (event) => setCurrency(event.target.value));
  elements["settings-currency-select"].addEventListener("change", (event) => setCurrency(event.target.value));

  elements["signout-button"].addEventListener("click", signOut);

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  });

  elements["transaction-type"].addEventListener("change", () => populateCategorySelect());
  elements["transaction-form"].addEventListener("submit", saveTransaction);
  elements["category-form"].addEventListener("submit", saveCategory);
  elements["payment-form"].addEventListener("submit", savePaymentMethod);
  elements["profile-form"].addEventListener("submit", saveProfile);
  elements["password-form"].addEventListener("submit", changePassword);

  elements["cancel-transaction-edit"].addEventListener("click", resetTransactionForm);
  elements["cancel-category-edit"].addEventListener("click", resetCategoryForm);
  elements["cancel-payment-edit"].addEventListener("click", resetPaymentForm);

  elements["password-reset-button"].addEventListener("click", requestPasswordReset);
  elements["privacy-button"].addEventListener("click", openPrivacyModal);
  elements["delete-account-button"].addEventListener("click", deactivateAccount);

  document.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.addEventListener("click", closePrivacyModal);
  });

  elements["privacy-modal"].addEventListener("click", (event) => {
    if (event.target === elements["privacy-modal"]) closePrivacyModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      closePrivacyModal();
    }
  });

  document.addEventListener("click", handleTableAction);

  supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    window.location.replace(pageUrl("index.html"));
  }
});
}

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  initializeTheme();
  setCurrency(state.currency);

  const authenticated = await requireAuthenticatedUser();
  if (!authenticated) return;

  bindEvents();
  resetTransactionForm();
  resetCategoryForm();
  resetPaymentForm();
  switchView(state.activeView);
  await refreshDashboard();
});
