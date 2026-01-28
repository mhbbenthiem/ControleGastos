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

function parseNumberBR(str) {
  if (!str) return NaN;
  const clean = str.trim().replace(/\./g, "").replace(",", ".");
  return Number(clean);
}

// converte quantidade para unidade-base (kg ou L quando aplicável)
function normalizeQty(qty, unit) {
  if (!Number.isFinite(qty) || qty <= 0) return { qtyBase: NaN, unitBase: unit };

  if (unit === "g") return { qtyBase: qty / 1000, unitBase: "kg" };
  if (unit === "ml") return { qtyBase: qty / 1000, unitBase: "l" };

  return { qtyBase: qty, unitBase: unit }; // un, kg, l
}

function unitLabel(u) {
  if (u === "un") return "un";
  if (u === "kg") return "kg";
  if (u === "l") return "L";
  return u;
}

function calcUnitPrice(totalValue, qty, unit) {
  const { qtyBase, unitBase } = normalizeQty(qty, unit);
  if (!Number.isFinite(totalValue) || !Number.isFinite(qtyBase) || qtyBase <= 0) {
    return { unitPrice: NaN, unitBase };
  }
  return { unitPrice: totalValue / qtyBase, unitBase };
}

function refreshUnitPricePreview(prefix) {
  // prefix: "f" ou "e"
  const v = parseMoneyBR($(`${prefix}Valor`).value);
  const q = parseNumberBR($(`${prefix}Qtd`).value);
  const u = $(`${prefix}Unit`).value;

  const { unitPrice, unitBase } = calcUnitPrice(v, q, u);
  const out = $(`${prefix}UnitPrice`);
  out.value = Number.isFinite(unitPrice)
    ? `${fmtBRL(unitPrice)} / ${unitLabel(unitBase)}`
    : "";
}


function setMsg(el, text) {
  el.textContent = text || "";
}

function switchTab(which) {
  const isLanc = which === "lanc";
  const isRel = which === "rel";
  const isCat = which === "cat";

  $("tabLancamentos").classList.toggle("active", isLanc);
  $("tabRelatorios").classList.toggle("active", isRel);
  $("tabCategorias").classList.toggle("active", isCat);

  $("viewLancamentos").classList.toggle("hidden", !isLanc);
  $("viewRelatorios").classList.toggle("hidden", !isRel);
  $("viewCategorias").classList.toggle("hidden", !isCat);
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
  $("eCategoria").value = e.category || "Outros";
  $("eObs").value = e.obs || "";
  $("eQtd").value = (e.qty ?? "").toString().replace(".", ",");
  $("eUnit").value = e.unit || "un";
  refreshUnitPricePreview("e");


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
  const qty = parseNumberBR($("eQtd").value);
  const unit = $("eUnit").value;
  const { unitPrice, unitBase } = calcUnitPrice(Number(value.toFixed(2)), qty, unit);

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
  ["eValor","eQtd","eUnit"].forEach(id => {
    $(id).addEventListener("input", () => refreshUnitPricePreview("e"));
    $(id).addEventListener("change", () => refreshUnitPricePreview("e"));
  });

  await updateExpense(expense);
  $("dlgEdit").close();
  await refreshLancamentos();
  await refreshReport();
  await refreshCategoriasView();

}

async function doDelete() {
  const id = Number($("eId").value);
  await deleteExpense(id);
  $("dlgEdit").close();
  await refreshLancamentos();
  await refreshReport();
  await refreshCategoriasView();

}

async function addFromForm() {
  const date = $("fData").value;
  const store = $("fLoja").value.trim();
  const item = $("fItem").value.trim();
  const category = $("fCategoria").value; 
  const obs = $("fObs").value.trim();
  const value = parseMoneyBR($("fValor").value);
  const qty = parseNumberBR($("fQtd").value);
  const unit = $("fUnit").value;


  if (!date || !store || !item || !Number.isFinite(value)) {
    setMsg($("msgForm"), "Preencha Data, Loja, Item e Valor corretamente.");
    return;
  }
  const { unitPrice, unitBase } = calcUnitPrice(Number(value.toFixed(2)), qty, unit);

  const expense = {
    date,
    month: monthFromDateISO(date),
    store,
    item,
    category: category || "",
    obs: obs || "",
    value: Number(value.toFixed(2)),

    qty: Number.isFinite(qty) ? qty : null,
    unit,                 // un/kg/g/l/ml (como digitado)
    unitBase,             // un/kg/l (normalizado)
    unitPrice: Number.isFinite(unitPrice) ? Number(unitPrice.toFixed(4)) : null,

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
  await refreshCategoriasView();

}

function clearForm() {
  $("fValor").value = "";
  $("fItem").value = "";
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
    const metric = (Number.isFinite(e.unitPrice) && e.unitPrice != null) ? e.unitPrice : e.value;


    const cat = (e.category || "").trim() || "Sem categoria";
    catTotals.set(cat, (catTotals.get(cat) || 0) + (Number(e.value) || 0));
  }

  $("totalMes").textContent = fmtBRL(total);
  $("uniqueItens").textContent = String(uniqueItems.size);
    // ---- cards por categoria (com itens) ----
  const catSections = $("catSections");
  const emptyCatSections = $("emptyCatSections");
  catSections.innerHTML = "";

  // agrupa lançamentos por categoria
  const byCat = new Map();
  for (const e of list) {
    const cat = (e.category || "").trim() || "Outros";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(e);
  }

  if (byCat.size === 0) {
    emptyCatSections.textContent = "Sem dados para este mês.";
  } else {
    emptyCatSections.textContent = "";

    // ordena categorias por total (desc)
    const catsSorted = [...byCat.keys()].sort((a, b) => (catTotals.get(b) || 0) - (catTotals.get(a) || 0));

    for (const cat of catsSorted) {
      const rows = byCat.get(cat);

      // total da categoria
      const totalCat = rows.reduce((acc, e) => acc + (Number(e.value) || 0), 0);

      // agrupa por item dentro da categoria (soma e menor preço)
      const byItem = new Map(); // item -> { sum, min, storeMin }
      for (const e of rows) {
        const key = e.item;
        const cur = byItem.get(key) || { sum: 0, min: Infinity, storeMin: "" };
        const v = Number(e.value) || 0;
        cur.sum += v;
        if (v < cur.min) {
          cur.min = v;
          cur.storeMin = e.store;
        }
        byItem.set(key, cur);
      }

      // monta HTML do card
      const wrap = document.createElement("div");
      wrap.className = "card";
      wrap.style.margin = "12px 0 0 0";

      const itemsSorted = [...byItem.entries()].sort((a, b) => b[1].sum - a[1].sum);

      wrap.innerHTML = `
        <div class="row" style="justify-content:space-between;">
          <div>
            <strong style="font-size:15px;">${escapeHtml(cat)}</strong>
            <div class="muted">${rows.length} lançamentos</div>
          </div>
          <div class="pill"><span class="muted">Total:</span> <strong>${fmtBRL(totalCat)}</strong></div>
        </div>

        <div style="overflow:auto; margin-top:10px;">
          <table class="table">
            <thead>
              <tr>
                <th>Item</th>
                <th class="right">Total no mês</th>
                <th>Mais barato (loja)</th>
                <th class="right">Menor preço</th>
              </tr>
            </thead>
            <tbody>
              ${itemsSorted.map(([item, info]) => `
                <tr>
                  <td>${escapeHtml(item)}</td>
                  <td class="right">${fmtBRL(info.sum)}</td>
                  <td>${escapeHtml(info.storeMin || "-")}</td>
                  <td class="right">${Number.isFinite(info.min) ? fmtBRL(info.min) : "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

      catSections.appendChild(wrap);
    }
  }

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
  $("todayLabel").textContent = formatDateBR(t);
  $("fData").value = t;
  $("filterDate").value = t;
  $("monthPicker").value = t.slice(0,7);
  $("catMonthPicker").value = t.slice(0,7);
}

function formatDateBR(dateStr) {
  // espera YYYY-MM-DD
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
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
  $("tabCategorias").onclick = async () => {
    switchTab("cat");
    await refreshCategoriasView();
  };

  $("catMonthPicker").addEventListener("change", refreshCategoriasView);
  $("catSelect").addEventListener("change", () => renderCategoriaSelecionada());

    ["fValor","fQtd","fUnit"].forEach(id => {
    $(id).addEventListener("input", () => refreshUnitPricePreview("f"));
    $(id).addEventListener("change", () => refreshUnitPricePreview("f"));
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
async function refreshCategoriasView() {
  const month = $("catMonthPicker").value;
  if (!month) return;

  const list = await getExpensesByMonth(month);

  // total do mês
  const totalMes = list.reduce((acc, e) => acc + (Number(e.value) || 0), 0);
  $("catTotalMes").textContent = fmtBRL(totalMes);

  // categorias disponíveis
  const byCat = new Map();
  for (const e of list) {
    const cat = (e.category || "").trim() || "Outros";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(e);
  }

  const catSelect = $("catSelect");
  catSelect.innerHTML = "";

  if (byCat.size === 0) {
    $("catEmpty").textContent = "Sem dados para este mês.";
    $("catAtual").textContent = "—";
    $("catList").innerHTML = "";
    $("catListEmpty").textContent = "";
    return;
  }

  $("catEmpty").textContent = "";

  const catsSorted = [...byCat.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const c of catsSorted) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  }

  // mantém seleção atual se possível
  const prev = catSelect.dataset.selected;
  if (prev && catsSorted.includes(prev)) catSelect.value = prev;

  await renderCategoriaSelecionada(byCat);
}

async function renderCategoriaSelecionada(byCatOverride = null) {
  const month = $("catMonthPicker").value;
  if (!month) return;

  const cat = $("catSelect").value;
  $("catSelect").dataset.selected = cat;
  $("catAtual").textContent = cat || "—";

  let byCat = byCatOverride;
  if (!byCat) {
    const list = await getExpensesByMonth(month);
    byCat = new Map();
    for (const e of list) {
      const c = (e.category || "").trim() || "Outros";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(e);
    }
  }

  const rows = byCat.get(cat) || [];
  const container = $("catList");
  container.innerHTML = "";

  if (!rows.length) {
    $("catListEmpty").textContent = "Nenhum lançamento nessa categoria.";
    return;
  }
  $("catListEmpty").textContent = "";

  // ordem mais recente primeiro (por data e id)
  rows.sort((a, b) => (b.date.localeCompare(a.date) || (b.id - a.id)));

  // total da categoria no mês
  const totalCat = rows.reduce((acc, e) => acc + (Number(e.value) || 0), 0);
  $("catAtual").textContent = `${cat} • ${fmtBRL(totalCat)}`;

  for (const e of rows) {
    const div = document.createElement("div");
    div.className = "item";

    const left = document.createElement("div");
    left.style.minWidth = "0";

    const title = document.createElement("strong");
    title.textContent = `${e.item} — ${fmtBRL(e.value)}`;

    const sub = document.createElement("small");
    const obs = e.obs ? ` • ${e.obs}` : "";
    sub.textContent = `${e.date} • ${e.store}${obs}`;

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
