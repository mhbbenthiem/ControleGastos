const DB_NAME = "gastos_pwa";
const DB_VERSION = 2;
const STORE = "expenses";
const STORES = "stores";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("by_date", "date"); // YYYY-MM-DD
        store.createIndex("by_month", "month"); // YYYY-MM
      }



if (!db.objectStoreNames.contains(STORES)) {
  // key = nome da loja (evita duplicados)
  db.createObjectStore(STORES, { keyPath: "name" });
}
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function addExpense(expense) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.add(expense);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateExpense(expense) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.put(expense);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function deleteExpense(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function getAllExpenses() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getExpensesByDate(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readonly");
    const idx = store.index("by_date");
    const req = idx.getAll(dateStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getExpensesByMonth(monthStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readonly");
    const idx = store.index("by_month");
    const req = idx.getAll(monthStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function clearAllExpenses() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function bulkPutExpenses(expenses) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    let count = 0;

    for (const e of expenses) {
      const req = store.put(e); // put aceita id existente
      req.onsuccess = () => { count += 1; };
      req.onerror = () => reject(req.error);
    }

    // termina a transação
    store.transaction.oncomplete = () => resolve(count);
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

async function addStore(name) {
  const clean = String(name || "").trim();
  if (!clean) return false;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORES, "readwrite").objectStore(STORES);
    // put para ser idempotente (sobrescreve se já existir)
    const req = store.put({ name: clean, createdAt: Date.now() });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function getAllStores() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORES, "readonly").objectStore(STORES);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result || []).map(x => x.name).filter(Boolean);
      list.sort((a,b) => a.localeCompare(b, "pt-BR"));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}
