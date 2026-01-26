const $ = (id) => document.getElementById(id);

function pad2(n) { return String(n).padStart(2, "0"); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function monthFromDateISO(dateStr) { return dateStr.slice(0, 7); }

function fmtBRL(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyBR(str) {
  // aceita "12,34" ou "12.34" ou "1.234,56"
  if (!str) return NaN;
  const clean = str.trim().replace(/\./g, "").replace(",", ".");
  return Number(clean);
}

function setMsg(el, text) {
  el.textContent = text || "";
}

function switchTab(which) {
  const isLanc = which === "lanc";
  $("tabLancamentos").classList.toggle("active", isLanc);
  $("tabRelatorios").classList.toggle("active", !isLanc);
  $("viewLancamentos").classList.toggle("hidden", !isLanc);
  $("viewRelatorios").classList.toggle("hidden", isLanc);
}

function renderLancamentos(list) {
  const container = $("listLancamentos");
  container.innerHTML = "";

  if (!list.length) {
    $("emptyLancamentos").textContent = "Nenhum lançamento para esta data.";
    return;
  } else {
    $("emptyLancamentos").textContent = "";
  }

  // ordem: mais recente primeiro (id desc)
  list.sort((a,b) => b.id - a.id);

  for (const e of list) {
    const div = document.createElement("div");
    div.className = "item";

    const left = document.createElement("div");
    left.style.minWidth = "0";

    const title = document.createElement("strong");
    title.textContent = `${e.item} — ${fmtBRL(e.value)}`;

    const sub = document.createElement("small");
    const cat = e.category ? ` • ${e.category}` : "";
    const obs = e.obs ? ` • ${e.obs}` : "";
    sub.textContent = `${e.date} • ${e.store}${cat}${obs}`;

    left.appendChild(title);
    left.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "actions";

    const btn = document.createElement("button");
    btn.className = "btn secondary";
    btn.textContent = "Editar";
    btn.onclick = () => openEdit(e);

    actions.appendChild(btn);

    div.appendChild(left);
    div.appendChild(actions);

    container.appendChild(div);
  }
}

async function refreshLancamentos() {
  const date = $("filterDate").value || todayISO();
  const list = await getExpensesByDate(date);

  // KPIs do dia
  let total = 0;
  for (const e of list) total += Number(e.value) || 0;
  $("totalHoje").textContent = fmtBRL(total);
  $("countHoje").textContent = String(list.length);

  renderLancamentos(list);
}

function openEdit(e) {
  $("eId").value = e.id;
  $("eData").value = e.date;
  $("eValor").value = String(e.value).replace(".", ",");
  $("eLoja").value = e.store;
  $("eItem").value = e.item;
  $("eCategoria").value = e.category || "";
  $("eObs").value = e.obs || "";

  setMsg($("msgEdit"), "");
  $("dlgEdit").showModal();
}

async function saveEdit() {
  const id = Number($("eId").value);
  const date = $("eData").value;
  const store = $("eLoja").value.trim();
  const item = $("eItem").value.trim();
  const category = $("eCategoria").value.trim();
  const obs = $("eObs").value.trim();
  const value = parseMoneyBR($("eValor").value);

  if (!date || !store || !item || !Number.isFinite(value)) {
    setMsg($("msgEdit"), "Preencha Data, Loja, Item e Valor corretamente.");
    return;
  }

  const expense = {
    id,
    date,
    month: monthFromDateISO(date),
    store,
    item,
    category: category || "",
    obs: obs || "",
    value: Number(value.toFixed(2)),
    updatedAt: Date.now(),
  };

  await updateExpense(expense);
  $("dlgEdit").close();
  await refreshLancamentos();
  await refreshReport();
}

async function doDelete() {
  const id = Number($("eId").value);
  await deleteExpense(id);
  $("dlgEdit").close();
  await refreshLancamentos();
  await refreshReport();
}

async function addFromForm() {
  const date = $("fData").value;
  const store = $("fLoja").value.trim();
  const item = $("fItem").value.trim();
  const category = $("fCategoria").value.trim();
  const obs = $("fObs").value.trim();
  const value = parseMoneyBR($("fValor").value);

  if (!date || !store || !item || !Number.isFinite(value)) {
    setMsg($("msgForm"), "Preencha Data, Loja, Item e Valor corretamente.");
    return;
  }

  const expense = {
    date,
    month: monthFromDateISO(date),
    store,
    item,
    category: category || "",
    obs: obs || "",
    value: Number(value.toFixed(2)),
    createdAt: Date.now(),
  };

  await addExpense(expense);
  setMsg($("msgForm"), "Salvo!");
  setTimeout(() => setMsg($("msgForm"), ""), 900);

  // limpa alguns campos (mantém data)
  $("fValor").value = "";
  $("fObs").value = "";

  await refreshLancamentos();
  await refreshReport();
}

function clearForm() {
  $("fValor").value = "";
  $("fLoja").value = "";
  $("fItem").value = "";
  $("fCategoria").value = "";
  $("fObs").value = "";
  setMsg($("msgForm"), "");
}

async function refreshReport() {
  const month = $("monthPicker").value;
  if (!month) return;

  const list = await getExpensesByMonth(month);

  $("countMes").textContent = String(list.length);

  let total = 0;
  const uniqueItems = new Set();

  // cheapest per item: keep min value and store
  const cheapest = new Map(); // item -> { store, value }
  const catTotals = new Map(); // category -> total

  for (const e of list) {
    total += Number(e.value) || 0;
    uniqueItems.add(e.item);

    // cheapest by item
    const prev = cheapest.get(e.item);
    if (!prev || Number(e.value) < prev.value) {
      cheapest.set(e.item, { store: e.store, value: Number(e.value) });
    }

    const cat = (e.category || "").trim() || "Sem categoria";
    catTotals.set(cat, (catTotals.get(cat) || 0) + (Number(e.value) || 0));
  }

  $("totalMes").textContent = fmtBRL(total);
  $("uniqueItens").textContent = String(uniqueItems.size);

  // render cheapest table
  const tbody = $("tableCheapest").querySelector("tbody");
  tbody.innerHTML = "";

  if (cheapest.size === 0) {
    $("emptyReport").textContent = "Sem dados para este mês.";
  } else {
    $("emptyReport").textContent = "";
    const rows = [...cheapest.entries()]
      .sort((a,b) => a[0].localeCompare(b[0], "pt-BR"));

    for (const [item, info] of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item)}</td>
        <td>${escapeHtml(info.store)}</td>
        <td class="right">${fmtBRL(info.value)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // render category totals
  const tbodyCat = $("tableCat").querySelector("tbody");
  tbodyCat.innerHTML = "";

  if (catTotals.size === 0) {
    $("emptyCat").textContent = "Sem dados para este mês.";
  } else {
    $("emptyCat").textContent = "";
    const rowsCat = [...catTotals.entries()]
      .sort((a,b) => b[1] - a[1]);

    for (const [cat, val] of rowsCat) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(cat)}</td>
        <td class="right">${fmtBRL(val)}</td>
      `;
      tbodyCat.appendChild(tr);
    }
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
}

function initDefaults() {
  const t = todayISO();
  $("todayLabel").textContent = t;
  $("fData").value = t;
  $("filterDate").value = t;
  $("monthPicker").value = t.slice(0,7);
}

function wireUI() {
  $("tabLancamentos").onclick = () => switchTab("lanc");
  $("tabRelatorios").onclick = () => { switchTab("rel"); refreshReport(); };

  $("btnAdd").onclick = addFromForm;
  $("btnLimpar").onclick = clearForm;

  $("btnHoje").onclick = async () => {
    const t = todayISO();
    $("filterDate").value = t;
    await refreshLancamentos();
  };

  $("filterDate").addEventListener("change", refreshLancamentos);
  $("monthPicker").addEventListener("change", refreshReport);

  $("btnSave").onclick = saveEdit;
  $("btnDelete").onclick = doDelete;
    $("btnExport").onclick = exportBD;

  $("fileImport").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    await importBDFromFile(file);
    ev.target.value = ""; // permite importar o mesmo arquivo de novo
  });

}

async function exportBD() {
  const all = await getAllExpenses();

  const payload = {
    schema: 1,
    exportedAt: new Date().toISOString(),
    expenses: all
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `gastos-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  $("backupMsg").textContent = `Exportado: ${all.length} lançamentos.`;
}

async function importBDFromFile(file) {
  const text = await file.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    $("backupMsg").textContent = "Arquivo inválido (JSON malformado).";
    return;
  }

  const expenses = data?.expenses;
  if (!Array.isArray(expenses)) {
    $("backupMsg").textContent = "Arquivo inválido: não encontrei 'expenses'.";
    return;
  }

  // validação leve
  for (const e of expenses) {
    if (!e.date || !e.month || !e.store || !e.item || typeof e.value !== "number") {
      $("backupMsg").textContent = "Arquivo inválido: estrutura de gasto inesperada.";
      return;
    }
  }

  // Decide estratégia:
  // - "mesclar": mantém o que já existe e sobrescreve por ID se repetir
  // - "substituir": limpa tudo e importa do zero
  // Aqui vou fazer "substituir" (mais previsível). Se quiser "mesclar", eu ajusto.
  const ok = confirm(`Isso vai SUBSTITUIR seu BD local por ${expenses.length} lançamentos do arquivo. Continuar?`);
  if (!ok) return;

  await clearAllExpenses();
  const count = await bulkPutExpenses(expenses);

  $("backupMsg").textContent = `Importado: ${count} lançamentos.`;

  await refreshLancamentos();
  await refreshReport();
}


(async function boot() {
  initDefaults();
  wireUI();
  await refreshLancamentos();
  await refreshReport();
})();
