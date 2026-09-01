/* ==========================================================================
   XBalance dashboard: CRUD, charts, authentication, and theme handling
   ========================================================================== */

const SUPABASE_URL = "https://moxwhdojgbjvlatkvzgp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veHdoZG9qZ2JqdmxhdGt2emdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjQ2MTAsImV4cCI6MjEwMzg0MDYxMH0.SQxk4ECN8fcVE4u5FhQ-ZrNqvJ0ToJ5okGVkNOa94gA";

/* Change this to your preferred display currency if needed. */
const CURRENCY = "USD";

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
    "theme-toggle",
    "signout-button",
    "user-email",
    "dashboard-message",
    "balance-total",
    "income-total",
    "expense-total",
    "cashflow-chart",
    "expense-chart",
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
    "transactions-table-body",
    "categories-table-body",
    "payment-methods-table-body"
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function setMessage(message = "", isError = false) {
  elements["dashboard-message"].textContent = message;
  elements["dashboard-message"].classList.toggle("is-error", isError);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("xbalance-theme", theme);

  const isDark = theme === "dark";
  elements["theme-toggle"].setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode"
  );
  elements["theme-toggle"].innerHTML = `<span aria-hidden="true">${isDark ? "☀" : "◐"}</span>`;

  if (state.cashflowChart || state.expenseChart) {
    renderCharts();
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("xbalance-theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

  elements["theme-toggle"].addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });
}

function escapeHtml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: CURRENCY
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

function getRelation(transaction, relationName) {
  const relation = transaction[relationName];
  return Array.isArray(relation) ? relation[0] : relation;
}

function getCssVariable(variableName) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();
}

function setTodayAsTransactionDate() {
  elements["transaction-date"].value = new Date().toISOString().slice(0, 10);
}

/* ==========================================================================
   Authentication
   ========================================================================== */

async function requireAuthenticatedUser() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.replace(pageUrl("index.html"));
    return false;
  }

  state.user = session.user;
  elements["user-email"].textContent = state.user.email || "Signed in";
  return true;
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setMessage(error.message, true);
    return;
  }

  window.location.replace(pageUrl("index.html"));
}

/* ==========================================================================
   Data loading
   ========================================================================== */

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
      categories (
        id,
        name,
        type,
        color
      ),
      payment_methods (
        id,
        name
      )
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

/* ==========================================================================
   Rendering
   ========================================================================== */

function populateCategorySelect(selectedId = "") {
  const transactionType = elements["transaction-type"].value;
  const validCategories = state.categories.filter(
    (category) => category.type === transactionType
  );

  elements["transaction-category"].innerHTML = validCategories.length
    ? validCategories
        .map(
          (category) =>
            `<option value="${category.id}">${escapeHtml(category.name)}</option>`
        )
        .join("")
    : `<option value="">Create a ${transactionType} category first</option>`;

  if (selectedId && validCategories.some((category) => String(category.id) === String(selectedId))) {
    elements["transaction-category"].value = selectedId;
  }
}

function populatePaymentMethodSelect(selectedId = "") {
  elements["transaction-payment-method"].innerHTML = `
    <option value="">No payment method</option>
    ${state.paymentMethods
      .map(
        (paymentMethod) =>
          `<option value="${paymentMethod.id}">${escapeHtml(paymentMethod.name)}</option>`
      )
      .join("")}
  `;

  if (
    selectedId &&
    state.paymentMethods.some(
      (paymentMethod) => String(paymentMethod.id) === String(selectedId)
    )
  ) {
    elements["transaction-payment-method"].value = selectedId;
  }
}

function renderSummary() {
  const income = state.transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const expenses = state.transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  elements["income-total"].textContent = formatMoney(income);
  elements["expense-total"].textContent = formatMoney(expenses);
  elements["balance-total"].textContent = formatMoney(income - expenses);
}

function renderTransactionsTable() {
  if (!state.transactions.length) {
    elements["transactions-table-body"].innerHTML = `
      <tr>
        <td class="empty-state" colspan="7">No transactions yet. Add your first one above.</td>
      </tr>
    `;
    return;
  }

  elements["transactions-table-body"].innerHTML = state.transactions
    .map((transaction) => {
      const category = getRelation(transaction, "categories");
      const paymentMethod = getRelation(transaction, "payment_methods");
      const amountClass = transaction.type === "income" ? "amount-income" : "amount-expense";
      const amountPrefix = transaction.type === "income" ? "+" : "−";

      return `
        <tr>
          <td>${formatDate(transaction.occurred_on)}</td>
          <td><span class="type-badge ${transaction.type}">${escapeHtml(transaction.type)}</span></td>
          <td>
            <span class="category-label">
              <span class="color-dot" style="background-color: ${escapeHtml(category?.color || "#94a3b8")}"></span>
              ${escapeHtml(category?.name)}
            </span>
          </td>
          <td>${escapeHtml(paymentMethod?.name)}</td>
          <td>${escapeHtml(transaction.description)}</td>
          <td class="${amountClass}">${amountPrefix}${formatMoney(transaction.amount)}</td>
          <td>
            <div class="table-actions">
              <button class="button button-secondary button-small" type="button" data-action="edit-transaction" data-id="${transaction.id}">
                Edit
              </button>
              <button class="button button-danger button-small" type="button" data-action="delete-transaction" data-id="${transaction.id}">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCategoriesTable() {
  if (!state.categories.length) {
    elements["categories-table-body"].innerHTML = `
      <tr><td class="empty-state" colspan="3">No categories yet.</td></tr>
    `;
    return;
  }

  elements["categories-table-body"].innerHTML = state.categories
    .map(
      (category) => `
        <tr>
          <td>
            <span class="category-label">
              <span class="color-dot" style="background-color: ${escapeHtml(category.color)}"></span>
              ${escapeHtml(category.name)}
            </span>
          </td>
          <td><span class="type-badge ${category.type}">${escapeHtml(category.type)}</span></td>
          <td>
            <div class="table-actions">
              <button class="button button-secondary button-small" type="button" data-action="edit-category" data-id="${category.id}">
                Edit
              </button>
              <button class="button button-danger button-small" type="button" data-action="delete-category" data-id="${category.id}">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderPaymentMethodsTable() {
  if (!state.paymentMethods.length) {
    elements["payment-methods-table-body"].innerHTML = `
      <tr><td class="empty-state" colspan="2">No payment methods yet.</td></tr>
    `;
    return;
  }

  elements["payment-methods-table-body"].innerHTML = state.paymentMethods
    .map(
      (paymentMethod) => `
        <tr>
          <td>${escapeHtml(paymentMethod.name)}</td>
          <td>
            <div class="table-actions">
              <button class="button button-secondary button-small" type="button" data-action="edit-payment" data-id="${paymentMethod.id}">
                Edit
              </button>
              <button class="button button-danger button-small" type="button" data-action="delete-payment" data-id="${paymentMethod.id}">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderCharts() {
  const incomeTotal = state.transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const expenseTransactions = state.transactions.filter(
    (transaction) => transaction.type === "expense"
  );

  const expenseTotal = expenseTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0
  );

  const expenseByCategory = new Map();

  expenseTransactions.forEach((transaction) => {
    const category = getRelation(transaction, "categories");
    const key = category?.id || "uncategorized";

    if (!expenseByCategory.has(key)) {
      expenseByCategory.set(key, {
        name: category?.name || "Uncategorized",
        color: category?.color || getCssVariable("--text-faint"),
        total: 0
      });
    }

    expenseByCategory.get(key).total += Number(transaction.amount);
  });

  if (state.cashflowChart) state.cashflowChart.destroy();
  if (state.expenseChart) state.expenseChart.destroy();

  const textColor = getCssVariable("--text-muted");
  const borderColor = getCssVariable("--border");
  const incomeColor = getCssVariable("--income");
  const expenseColor = getCssVariable("--expense");

  state.cashflowChart = new Chart(elements["cashflow-chart"], {
    type: "bar",
    data: {
      labels: ["Income", "Expenses"],
      datasets: [
        {
          data: [incomeTotal, expenseTotal],
          backgroundColor: [incomeColor, expenseColor],
          borderRadius: 8,
          borderSkipped: false
        }
      ]
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

  const breakdown = [...expenseByCategory.values()];
  const hasExpenses = breakdown.length > 0;

  state.expenseChart = new Chart(elements["expense-chart"], {
    type: "doughnut",
    data: {
      labels: hasExpenses ? breakdown.map((item) => item.name) : ["No expense data"],
      datasets: [
        {
          data: hasExpenses ? breakdown.map((item) => item.total) : [1],
          backgroundColor: hasExpenses
            ? breakdown.map((item) => item.color)
            : [borderColor],
          borderColor: getCssVariable("--surface"),
          borderWidth: 4
        }
      ]
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
  renderTransactionsTable();
  renderCategoriesTable();
  renderPaymentMethodsTable();
  renderCharts();
}

/* ==========================================================================
   Form reset and edit helpers
   ========================================================================== */

function resetTransactionForm() {
  elements["transaction-form"].reset();
  elements["transaction-id"].value = "";
  elements["transaction-form-title"].textContent = "Add transaction";
  elements["cancel-transaction-edit"].classList.add("is-hidden");
  elements["transaction-type"].value = "expense";
  setTodayAsTransactionDate();
  populateCategorySelect();
  populatePaymentMethodSelect();
}

function resetCategoryForm() {
  elements["category-form"].reset();
  elements["category-id"].value = "";
  elements["category-form-title"].textContent = "Add category";
  elements["category-color"].value = "#10b981";
  elements["cancel-category-edit"].classList.add("is-hidden");
}

function resetPaymentForm() {
  elements["payment-form"].reset();
  elements["payment-id"].value = "";
  elements["payment-form-title"].textContent = "Payment methods";
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
  elements["transaction-form"].scrollIntoView({ behavior: "smooth", block: "center" });
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
  elements["category-form"].scrollIntoView({ behavior: "smooth", block: "center" });
}

function editPaymentMethod(id) {
  const paymentMethod = state.paymentMethods.find((item) => String(item.id) === String(id));
  if (!paymentMethod) return;

  elements["payment-id"].value = paymentMethod.id;
  elements["payment-name"].value = paymentMethod.name;
  elements["payment-form-title"].textContent = "Edit payment method";
  elements["cancel-payment-edit"].classList.remove("is-hidden");
  elements["payment-form"].scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ==========================================================================
   Create and update operations
   ========================================================================== */

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

    const query = id
      ? supabaseClient.from("transactions").update(payload).eq("id", id)
      : supabaseClient.from("transactions").insert(payload);

    const { error } = await query;
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

    const query = id
      ? supabaseClient.from("categories").update(payload).eq("id", id)
      : supabaseClient.from("categories").insert(payload);

    const { error } = await query;
    if (error) throw error;

    resetCategoryForm();
    await refreshDashboard();
  } catch (error) {
    setMessage(
      error.message ||
        "Unable to save the category. Categories used by transactions cannot change type.",
      true
    );
  }
}

async function savePaymentMethod(event) {
  event.preventDefault();

  const id = elements["payment-id"].value;
  const payload = {
    name: elements["payment-name"].value.trim()
  };

  try {
    setMessage(id ? "Updating payment method…" : "Saving payment method…");

    const query = id
      ? supabaseClient.from("payment_methods").update(payload).eq("id", id)
      : supabaseClient.from("payment_methods").insert(payload);

    const { error } = await query;
    if (error) throw error;

    resetPaymentForm();
    await refreshDashboard();
  } catch (error) {
    setMessage(error.message || "Unable to save the payment method.", true);
  }
}

/* ==========================================================================
   Delete operations
   ========================================================================== */

async function deleteRecord(table, id, label) {
  const confirmed = window.confirm(`Delete this ${label}? This action cannot be undone.`);
  if (!confirmed) return;

  try {
    setMessage(`Deleting ${label}…`);

    const { error } = await supabaseClient.from(table).delete().eq("id", id);
    if (error) throw error;

    await refreshDashboard();
  } catch (error) {
    setMessage(
      error.message ||
        `Unable to delete this ${label}. It may still be used by a transaction.`,
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

/* ==========================================================================
   Event binding and startup
   ========================================================================== */

function bindEvents() {
  elements["signout-button"].addEventListener("click", signOut);

  elements["transaction-type"].addEventListener("change", () => {
    populateCategorySelect();
  });

  elements["transaction-form"].addEventListener("submit", saveTransaction);
  elements["category-form"].addEventListener("submit", saveCategory);
  elements["payment-form"].addEventListener("submit", savePaymentMethod);

  elements["cancel-transaction-edit"].addEventListener("click", resetTransactionForm);
  elements["cancel-category-edit"].addEventListener("click", resetCategoryForm);
  elements["cancel-payment-edit"].addEventListener("click", resetPaymentForm);

  document.addEventListener("click", handleTableAction);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      window.location.replace(pageUrl("index.html"));
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  initializeTheme();

  const authenticated = await requireAuthenticatedUser();
  if (!authenticated) return;

  bindEvents();
  resetTransactionForm();
  resetCategoryForm();
  resetPaymentForm();
  await refreshDashboard();
});
